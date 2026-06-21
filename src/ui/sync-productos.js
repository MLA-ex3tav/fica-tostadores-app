import { runAutoProductosSync } from '../services/productos-firebase-sync.js';

const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** @type {ReturnType<typeof setInterval> | null} */
let syncIntervalId = null;

/** @type {Promise<import('../services/productos-firebase-sync.js').ProductosSyncResult | null> | null} */
let syncInFlight = null;

/**
 * @param {{ reason?: 'startup' | 'interval' | 'view' | 'manual'; force?: boolean; notifyOnError?: boolean }} [options]
 */
export async function runProductosSync(options = {}) {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = runAutoProductosSync(options).finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export function startAutoProductosSync() {
  stopAutoProductosSync();

  void runProductosSync({ reason: 'startup', notifyOnError: false });

  syncIntervalId = window.setInterval(() => {
    void runProductosSync({ reason: 'interval', notifyOnError: false });
  }, SYNC_INTERVAL_MS);

  console.log('[productos-sync] Programada cada 2 horas');
}

export function stopAutoProductosSync() {
  if (syncIntervalId != null) {
    window.clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

export function destroyAutoProductosSync() {
  stopAutoProductosSync();
}
