import { syncPendingToFirebase } from '../services/cotizaciones.js';
import { countPendingSyncLocal } from '../services/local-db.js';
import { getCurrentUser } from '../firebase/auth.js';
import { formatFirestoreError } from '../firebase/errors.js';
import { showToast } from './app-alerts.js';

const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** @type {ReturnType<typeof setInterval> | null} */
let syncIntervalId = null;

/** @type {Promise<{ synced: number; failed: number; errors: Array<{ id: string; message: string }> }> | null} */
let syncInFlight = null;

/**
 * @param {{ reason?: 'interval' | 'quit'; notifyOnError?: boolean }} [options]
 */
export async function runAutoFirebaseSync(options = {}) {
  const { reason = 'interval', notifyOnError = reason === 'interval' } = options;

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      if (!getCurrentUser()) {
        return { synced: 0, failed: 0, errors: [] };
      }

      const pending = await countPendingSyncLocal();
      if (pending === 0) {
        return { synced: 0, failed: 0, errors: [] };
      }

      const result = await syncPendingToFirebase();

      if (result.failed > 0 && notifyOnError) {
        const detail = result.errors.map((entry) => entry.message).join(' ');
        showToast({
          message: `Sincronización automática: ${result.synced} guardados, ${result.failed} fallaron. ${detail}`,
          variant: 'error',
          duration: 8000,
        });
      } else if (result.synced > 0) {
        console.log(`[sync-auto] ${reason}: ${result.synced} cambio(s) enviados a Firebase`);
      }

      return result;
    } catch (error) {
      console.error('[sync-auto]', error);
      if (notifyOnError) {
        showToast({
          message: formatFirestoreError(error),
          variant: 'error',
          duration: 6000,
        });
      }
      throw error;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export function startAutoFirebaseSync() {
  stopAutoFirebaseSync();

  syncIntervalId = window.setInterval(() => {
    void runAutoFirebaseSync({ reason: 'interval' });
  }, SYNC_INTERVAL_MS);

  console.log('[sync-auto] Programada cada 2 horas');
}

export function stopAutoFirebaseSync() {
  if (syncIntervalId != null) {
    window.clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

function bindQuitSync() {
  if (!window.electronAPI?.onSyncBeforeQuit) return;

  window.electronAPI.onSyncBeforeQuit(() => {
    void (async () => {
      try {
        await runAutoFirebaseSync({ reason: 'quit', notifyOnError: false });
      } catch {
        // Al cerrar no bloqueamos; el main tiene timeout de respaldo.
      } finally {
        window.electronAPI?.notifySyncBeforeQuitDone?.();
      }
    })();
  });
}

export function initAutoFirebaseSync() {
  bindQuitSync();
}

export function destroyAutoFirebaseSync() {
  stopAutoFirebaseSync();
}
