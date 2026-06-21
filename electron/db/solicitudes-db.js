const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/** @type {import('better-sqlite3').Database | null} */
let db = null;

const SYNC_SYNCED = 'synced';
const SYNC_DIRTY = 'dirty';
const SYNC_DELETE_PENDING = 'delete_pending';

const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS solicitudes (
  id TEXT PRIMARY KEY NOT NULL,
  estado TEXT,
  created_at_ms INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  synced_at_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_created ON solicitudes(created_at_ms DESC);
`;

/**
 * @param {string} userDataPath
 */
function initSolicitudesDb(userDataPath) {
  if (db) return db;

  const dir = path.join(userDataPath, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'fica-local.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(BASE_SCHEMA);
  migrateSolicitudesSchema();
  migrateAppSchema();

  console.log('[sqlite] Base local en', dbPath);
  return db;
}

function migrateSolicitudesSchema() {
  if (!db) return;

  const columns = db.prepare('PRAGMA table_info(solicitudes)').all();
  if (columns.length === 0) return;

  const names = new Set(columns.map((col) => col.name));

  if (!names.has('sync_status')) {
    db.exec(`ALTER TABLE solicitudes ADD COLUMN sync_status TEXT NOT NULL DEFAULT '${SYNC_SYNCED}'`);
  }
  if (!names.has('local_updated_at_ms')) {
    db.exec('ALTER TABLE solicitudes ADD COLUMN local_updated_at_ms INTEGER NOT NULL DEFAULT 0');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_solicitudes_sync ON solicitudes(sync_status)');
}

function migrateAppSchema() {
  if (!db) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS productos (
      id TEXT PRIMARY KEY NOT NULL,
      codigo TEXT,
      nombre TEXT NOT NULL,
      modelo TEXT,
      capacidad_kg REAL,
      precio_base REAL,
      activo INTEGER NOT NULL DEFAULT 1,
      especificaciones_json TEXT,
      updated_at_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
  `);
}

function closeSolicitudesDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object' && value !== null) {
    if ('seconds' in value && typeof value.seconds === 'number') {
      return value.seconds * 1000;
    }
    if ('toDate' in value && typeof value.toDate === 'function') {
      return value.toDate().getTime();
    }
    if (value instanceof Date) {
      return value.getTime();
    }
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} data
 * @returns {number}
 */
function resolveCreatedAtMs(data) {
  return timestampToMs(
    data.createdAt ?? data.fecha ?? data.creadoEn ?? data.aprobadaAt ?? data.cotizacionAt
  );
}

/**
 * @param {string} id
 * @returns {{ id: string; estado: string | null; payload_json: string; sync_status: string } | undefined}
 */
function getSolicitudRow(id) {
  if (!db) throw new Error('SQLite no inicializado');
  return db.prepare('SELECT id, estado, payload_json, sync_status FROM solicitudes WHERE id = ?').get(id);
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} data
 * @param {string} syncStatus
 * @param {number} [localUpdatedAtMs]
 */
function writeSolicitud(id, data, syncStatus, localUpdatedAtMs = 0) {
  if (!db) throw new Error('SQLite no inicializado');

  const estado = typeof data.estado === 'string' ? data.estado : null;
  const createdAtMs = resolveCreatedAtMs(data);
  const now = Date.now();
  const existing = db.prepare('SELECT synced_at_ms FROM solicitudes WHERE id = ?').get(id);
  const syncedAtMs = syncStatus === SYNC_SYNCED ? now : (existing?.synced_at_ms ?? now);

  db.prepare(
    `INSERT INTO solicitudes (id, estado, created_at_ms, payload_json, synced_at_ms, sync_status, local_updated_at_ms)
     VALUES (@id, @estado, @created_at_ms, @payload_json, @synced_at_ms, @sync_status, @local_updated_at_ms)
     ON CONFLICT(id) DO UPDATE SET
       estado = excluded.estado,
       created_at_ms = excluded.created_at_ms,
       payload_json = excluded.payload_json,
       synced_at_ms = excluded.synced_at_ms,
       sync_status = excluded.sync_status,
       local_updated_at_ms = excluded.local_updated_at_ms`
  ).run({
    id,
    estado,
    created_at_ms: createdAtMs,
    payload_json: JSON.stringify(data),
    synced_at_ms: syncedAtMs,
    sync_status: syncStatus,
    local_updated_at_ms: localUpdatedAtMs,
  });
}

/**
 * Importa desde Firebase sin pisar cambios locales pendientes.
 * @param {Array<{ id: string; data: Record<string, unknown> }>} upserts
 * @param {string[]} removedIds
 */
function importFromFirebase(upserts, removedIds) {
  if (!db) throw new Error('SQLite no inicializado');

  const tx = db.transaction(() => {
    const getStatusStmt = db.prepare('SELECT sync_status FROM solicitudes WHERE id = ?');

    for (const id of removedIds) {
      const row = getStatusStmt.get(id);
      if (!row || row.sync_status === SYNC_SYNCED) {
        db.prepare('DELETE FROM solicitudes WHERE id = ?').run(id);
      }
    }

    for (const entry of upserts) {
      const existing = getStatusStmt.get(entry.id);
      if (!existing) {
        writeSolicitud(entry.id, entry.data, SYNC_SYNCED, 0);
        continue;
      }
      if (existing.sync_status === SYNC_SYNCED) {
        writeSolicitud(entry.id, entry.data, SYNC_SYNCED, 0);
      }
    }
  });

  tx();
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
function updateSolicitudLocal(id, patch) {
  if (!db) throw new Error('SQLite no inicializado');

  const row = getSolicitudRow(id);
  if (!row || row.sync_status === SYNC_DELETE_PENDING) {
    throw new Error('Solicitud no encontrada');
  }

  const current = JSON.parse(row.payload_json);
  const merged = { ...current, ...patch };
  writeSolicitud(id, merged, SYNC_DIRTY, Date.now());
}

/**
 * @param {string} id
 */
function deleteSolicitudLocalSoft(id) {
  if (!db) throw new Error('SQLite no inicializado');

  const row = getSolicitudRow(id);
  if (!row) return;

  db.prepare(
    `UPDATE solicitudes
     SET sync_status = @sync_status, local_updated_at_ms = @local_updated_at_ms
     WHERE id = @id`
  ).run({
    id,
    sync_status: SYNC_DELETE_PENDING,
    local_updated_at_ms: Date.now(),
  });
}

/**
 * @param {string} id
 */
function purgeSolicitudLocal(id) {
  if (!db) throw new Error('SQLite no inicializado');
  db.prepare('DELETE FROM solicitudes WHERE id = ?').run(id);
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} data
 */
function markSolicitudSynced(id, data) {
  if (!db) throw new Error('SQLite no inicializado');
  writeSolicitud(id, data, SYNC_SYNCED, 0);
}

/**
 * @returns {Array<{ id: string; sync_status: string; data: Record<string, unknown> }>}
 */
function listPendingSync() {
  if (!db) throw new Error('SQLite no inicializado');

  const rows = db
    .prepare(
      `SELECT id, sync_status, payload_json
       FROM solicitudes
       WHERE sync_status IN (@dirty, @delete_pending)
       ORDER BY local_updated_at_ms ASC`
    )
    .all({
      dirty: SYNC_DIRTY,
      delete_pending: SYNC_DELETE_PENDING,
    });

  return rows.map((row) => ({
    id: row.id,
    sync_status: row.sync_status,
    data: JSON.parse(row.payload_json),
  }));
}

function countPendingSync() {
  if (!db) throw new Error('SQLite no inicializado');
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM solicitudes WHERE sync_status IN (@dirty, @delete_pending)`
    )
    .get({ dirty: SYNC_DIRTY, delete_pending: SYNC_DELETE_PENDING });
  return row?.total ?? 0;
}

/**
 * @returns {Array<{ id: string } & Record<string, unknown>>}
 */
function listAllSolicitudes() {
  if (!db) throw new Error('SQLite no inicializado');

  const rows = db
    .prepare(
      `SELECT id, payload_json FROM solicitudes
       WHERE sync_status != @delete_pending
       ORDER BY created_at_ms DESC`
    )
    .all({ delete_pending: SYNC_DELETE_PENDING });

  return rows.map((row) => {
    const data = JSON.parse(row.payload_json);
    return { id: row.id, ...data };
  });
}

/** @deprecated Usar importFromFirebase */
function applySolicitudChanges(upserts, removedIds) {
  importFromFirebase(upserts, removedIds);
}

/** @deprecated Usar deleteSolicitudLocalSoft */
function deleteSolicitudLocal(id) {
  deleteSolicitudLocalSoft(id);
}

/**
 * @param {string} key
 * @returns {unknown}
 */
function getAppSetting(key) {
  if (!db) throw new Error('SQLite no inicializado');
  const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key);
  if (!row) return null;
  return JSON.parse(row.value_json);
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function setAppSetting(key, value) {
  if (!db) throw new Error('SQLite no inicializado');
  db.prepare(
    `INSERT INTO app_settings (key, value_json) VALUES (@key, @value_json)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
  ).run({ key, value_json: JSON.stringify(value) });
}

/**
 * @returns {Record<string, unknown>}
 */
function getAllAppSettings() {
  if (!db) throw new Error('SQLite no inicializado');
  const rows = db.prepare('SELECT key, value_json FROM app_settings').all();
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const row of rows) {
    out[row.key] = JSON.parse(row.value_json);
  }
  return out;
}

/**
 * @returns {Array<Record<string, unknown>>}
 */
function listProductos() {
  if (!db) throw new Error('SQLite no inicializado');
  const rows = db
    .prepare(
      `SELECT id, codigo, nombre, modelo, capacidad_kg, precio_base, activo, especificaciones_json, updated_at_ms
       FROM productos ORDER BY nombre COLLATE NOCASE ASC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    modelo: row.modelo,
    capacidadKg: row.capacidad_kg,
    precioBase: row.precio_base,
    activo: Boolean(row.activo),
    especificaciones:
      row.especificaciones_json != null ? JSON.parse(row.especificaciones_json) : null,
    updatedAtMs: row.updated_at_ms,
  }));
}

/**
 * @param {Record<string, unknown>} product
 */
function upsertProducto(product) {
  if (!db) throw new Error('SQLite no inicializado');
  const id = String(product.id);
  db.prepare(
    `INSERT INTO productos (
      id, codigo, nombre, modelo, capacidad_kg, precio_base, activo, especificaciones_json, updated_at_ms
    ) VALUES (
      @id, @codigo, @nombre, @modelo, @capacidad_kg, @precio_base, @activo, @especificaciones_json, @updated_at_ms
    )
    ON CONFLICT(id) DO UPDATE SET
      codigo = excluded.codigo,
      nombre = excluded.nombre,
      modelo = excluded.modelo,
      capacidad_kg = excluded.capacidad_kg,
      precio_base = excluded.precio_base,
      activo = excluded.activo,
      especificaciones_json = excluded.especificaciones_json,
      updated_at_ms = excluded.updated_at_ms`
  ).run({
    id,
    codigo: product.codigo ?? null,
    nombre: product.nombre ?? 'Producto',
    modelo: product.modelo ?? null,
    capacidad_kg: product.capacidadKg ?? product.capacidad_kg ?? null,
    precio_base: product.precioBase ?? product.precio_base ?? null,
    activo: product.activo === false ? 0 : 1,
    especificaciones_json:
      product.especificaciones != null ? JSON.stringify(product.especificaciones) : null,
    updated_at_ms: Date.now(),
  });
}

/**
 * @param {string} id
 */
function deleteProducto(id) {
  if (!db) throw new Error('SQLite no inicializado');
  db.prepare('DELETE FROM productos WHERE id = ?').run(id);
}

/**
 * @param {Array<Record<string, unknown>>} products
 * @returns {number}
 */
function syncProductosBatch(products) {
  if (!db) throw new Error('SQLite no inicializado');
  const upsert = db.prepare(
    `INSERT INTO productos (
      id, codigo, nombre, modelo, capacidad_kg, precio_base, activo, especificaciones_json, updated_at_ms
    ) VALUES (
      @id, @codigo, @nombre, @modelo, @capacidad_kg, @precio_base, @activo, @especificaciones_json, @updated_at_ms
    )
    ON CONFLICT(id) DO UPDATE SET
      codigo = excluded.codigo,
      nombre = excluded.nombre,
      modelo = excluded.modelo,
      capacidad_kg = excluded.capacidad_kg,
      precio_base = excluded.precio_base,
      activo = excluded.activo,
      especificaciones_json = excluded.especificaciones_json,
      updated_at_ms = excluded.updated_at_ms`
  );

  const now = Date.now();
  const tx = db.transaction((items) => {
    for (const product of items) {
      upsert.run({
        id: String(product.id),
        codigo: product.codigo ?? null,
        nombre: product.nombre ?? 'Producto',
        modelo: product.modelo ?? null,
        capacidad_kg: product.capacidadKg ?? product.capacidad_kg ?? null,
        precio_base: product.precioBase ?? product.precio_base ?? null,
        activo: product.activo === false ? 0 : 1,
        especificaciones_json:
          product.especificaciones != null ? JSON.stringify(product.especificaciones) : null,
        updated_at_ms: now,
      });
    }
  });

  tx(products);
  return products.length;
}

module.exports = {
  initSolicitudesDb,
  closeSolicitudesDb,
  importFromFirebase,
  applySolicitudChanges,
  updateSolicitudLocal,
  deleteSolicitudLocalSoft,
  deleteSolicitudLocal,
  purgeSolicitudLocal,
  markSolicitudSynced,
  listPendingSync,
  countPendingSync,
  listAllSolicitudes,
  getAppSetting,
  setAppSetting,
  getAllAppSettings,
  listProductos,
  upsertProducto,
  deleteProducto,
  syncProductosBatch,
};
