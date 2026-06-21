/**
 * Exporta colecciones públicas de Firestore a JSON legible (para revisión / Cursor Agent).
 *
 * Uso: npm run firestore:inspect
 *
 * Requiere reglas con lectura pública en productos y catalogo_config.
 * Colecciones staff-only (solicitudes, clientes) no se incluyen aquí.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'fica-tostadores';
const OUT_DIR = path.join(root, 'firebase', 'snapshots');
const OUT_FILE = path.join(OUT_DIR, 'catalog-snapshot.json');

/** @param {unknown} value */
function decodeFirestoreValue(value) {
  if (value == null || typeof value !== 'object') return value;
  const record = /** @type {Record<string, unknown>} */ (value);

  if ('stringValue' in record) return record.stringValue;
  if ('booleanValue' in record) return record.booleanValue;
  if ('integerValue' in record) return Number(record.integerValue);
  if ('doubleValue' in record) return record.doubleValue;
  if ('nullValue' in record) return null;
  if ('timestampValue' in record) return record.timestampValue;
  if ('mapValue' in record) {
    const fields = /** @type {{ fields?: Record<string, unknown> }} */ (record.mapValue).fields ?? {};
    return decodeFirestoreFields(fields);
  }
  if ('arrayValue' in record) {
    const values = /** @type {{ values?: unknown[] }} */ (record.arrayValue).values ?? [];
    return values.map(decodeFirestoreValue);
  }

  return value;
}

/** @param {Record<string, unknown>} fields */
function decodeFirestoreFields(fields) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = decodeFirestoreValue(value);
  }
  return out;
}

/**
 * @param {string} collectionId
 * @returns {Promise<Array<{ id: string; data: Record<string, unknown> }>>}
 */
async function listCollection(collectionId) {
  /** @type {Array<{ id: string; data: Record<string, unknown> }>} */
  const items = [];
  let pageToken = '';

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}`
    );
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Firestore ${collectionId}: ${response.status} ${body.slice(0, 200)}`);
    }

    const payload = await response.json();
    const documents = Array.isArray(payload.documents) ? payload.documents : [];

    for (const doc of documents) {
      const name = String(doc.name ?? '');
      const id = name.split('/').pop() ?? name;
      const fields = doc.fields ?? {};
      items.push({ id, data: decodeFirestoreFields(fields) });
    }

    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
  } while (pageToken);

  return items;
}

/**
 * @param {string} collectionId
 * @param {string} docId
 */
async function getDocument(collectionId, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}/${docId}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore ${collectionId}/${docId}: ${response.status} ${body.slice(0, 200)}`);
  }
  const doc = await response.json();
  const fields = doc.fields ?? {};
  return { id: docId, data: decodeFirestoreFields(fields) };
}

async function main() {
  console.log(`[firestore:inspect] Proyecto: ${PROJECT_ID}`);

  const productos = await listCollection('productos');
  productos.sort((a, b) => a.id.localeCompare(b.id, 'es'));

  /** @type {Record<string, unknown>} */
  const catalogoConfig = {};
  const configDocs = await listCollection('catalogo_config');
  if (configDocs.length > 0) {
    for (const entry of configDocs) {
      catalogoConfig[entry.id] = entry.data;
    }
  } else {
    const fallback = await getDocument('catalogo_config', 'main');
    if (fallback) catalogoConfig.main = fallback.data;
  }

  const snapshot = {
    exportedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    source: 'Firestore REST API (lectura pública)',
    collections: {
      productos: {
        count: productos.length,
        items: productos.map((p) => ({ id: p.id, ...p.data })),
      },
      catalogo_config: {
        count: Object.keys(catalogoConfig).length,
        docs: catalogoConfig,
      },
    },
    notes: [
      'Generado con npm run firestore:inspect',
      'Solicitudes y clientes requieren auth staff; no se exportan aquí.',
      'Refresca este archivo cuando cambie el catálogo en Firebase.',
    ],
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`[firestore:inspect] ${productos.length} producto(s) → ${path.relative(root, OUT_FILE)}`);
  if (Object.keys(catalogoConfig).length > 0) {
    console.log(`[firestore:inspect] catalogo_config: ${Object.keys(catalogoConfig).join(', ')}`);
  }
}

main().catch((error) => {
  console.error('[firestore:inspect]', error instanceof Error ? error.message : error);
  process.exit(1);
});
