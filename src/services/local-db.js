/**
 * Cliente IPC hacia SQLite en el proceso principal de Electron.
 */

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function firestoreValueToJson(value) {
  if (value == null) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(firestoreValueToJson);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = firestoreValueToJson(nested);
    }
    return out;
  }
  return value;
}

/**
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown>}
 */
export function serializeFirestoreDoc(data) {
  return /** @type {Record<string, unknown>} */ (firestoreValueToJson(data));
}

export function isLocalDbAvailable() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.listAllSolicitudesLocal);
}

/**
 * @param {Array<{ id: string; data: Record<string, unknown> }>} upserts
 * @param {string[]} removedIds
 */
export async function importFromFirebaseLocal(upserts, removedIds) {
  if (!isLocalDbAvailable()) return;
  await window.electronAPI.importFromFirebaseLocal({
    upserts: upserts.map((entry) => ({
      id: entry.id,
      data: serializeFirestoreDoc(entry.data),
    })),
    removedIds,
  });
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function updateSolicitudLocal(id, patch) {
  if (!isLocalDbAvailable()) {
    throw new Error('Base de datos local no disponible');
  }
  await window.electronAPI.updateSolicitudLocal({ id, patch: serializeFirestoreDoc(patch) });
}

/**
 * @param {string} id
 */
export async function deleteSolicitudLocalSoft(id) {
  if (!isLocalDbAvailable()) {
    throw new Error('Base de datos local no disponible');
  }
  await window.electronAPI.deleteSolicitudLocalSoft(id);
}

/**
 * @param {string} id
 */
export async function purgeSolicitudLocal(id) {
  if (!isLocalDbAvailable()) return;
  await window.electronAPI.purgeSolicitudLocal(id);
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} data
 */
export async function markSolicitudSyncedLocal(id, data) {
  if (!isLocalDbAvailable()) return;
  await window.electronAPI.markSolicitudSyncedLocal({ id, data: serializeFirestoreDoc(data) });
}

/**
 * @returns {Promise<Array<{ id: string; sync_status: string; data: Record<string, unknown> }>>}
 */
export async function listPendingSyncLocal() {
  if (!isLocalDbAvailable()) return [];
  const result = await window.electronAPI.listPendingSyncLocal();
  return result.items ?? [];
}

/**
 * @returns {Promise<number>}
 */
export async function countPendingSyncLocal() {
  if (!isLocalDbAvailable()) return 0;
  const result = await window.electronAPI.countPendingSyncLocal();
  return result.count ?? 0;
}

/**
 * @returns {Promise<Array<{ id: string } & Record<string, unknown>>>}
 */
export async function listAllSolicitudesLocal() {
  if (!isLocalDbAvailable()) return [];
  const result = await window.electronAPI.listAllSolicitudesLocal();
  return result.items ?? [];
}

/** @deprecated */
export async function applySolicitudChanges(upserts, removedIds) {
  return importFromFirebaseLocal(upserts, removedIds);
}

/** @deprecated */
export async function deleteSolicitudLocal(id) {
  return deleteSolicitudLocalSoft(id);
}
