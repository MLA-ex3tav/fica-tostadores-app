import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getDb, initFirebase } from '../firebase/init.js';
import { isFirebaseConfigured } from '../firebase/config.js';
import { formatFirestoreError } from '../firebase/errors.js';
import { upsertProducto } from './productos.js';
import { getCachedAppSettings, setAppSetting, loadAppSettings } from './app-settings.js';
import { mapCatalogProductToLocal } from './productos-catalog-map.js';

const PRODUCTOS_COLLECTION = 'productos';
const CATALOGO_CONFIG_PATH = ['catalogo_config', 'default'];

/**
 * @returns {Promise<unknown[]>}
 */
async function fetchProductosFromFirebase() {
  initFirebase();
  const db = getDb();
  if (!db) {
    throw new Error('Firebase no está configurado');
  }

  const collectionSnap = await getDocs(collection(db, PRODUCTOS_COLLECTION));
  return collectionSnap.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  }));
}

/**
 * @param {import('firebase/firestore').Firestore} db
 */
async function fetchCatalogoConfig(db) {
  const ref = doc(db, CATALOGO_CONFIG_PATH[0], CATALOGO_CONFIG_PATH[1]);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * @returns {Promise<{ imported: number; total: number; skipped: number }>}
 */
export async function syncProductosFromFirebase() {
  let rawItems;
  try {
    initFirebase();
    const db = getDb();
    if (!db) {
      throw new Error('Firebase no está configurado');
    }

    const [items, catalogoConfig] = await Promise.all([
      fetchProductosFromFirebase(),
      fetchCatalogoConfig(db),
    ]);

    rawItems = items;

    if (catalogoConfig) {
      await setAppSetting('catalogoConfig', catalogoConfig);
    }
  } catch (error) {
    throw new Error(formatFirestoreError(error));
  }

  if (rawItems.length === 0) {
    throw new Error(
      `No hay productos en Firestore (colección «${PRODUCTOS_COLLECTION}»)`
    );
  }

  /** @type {import('./productos.js').ProductoRecord[]} */
  const mapped = [];
  let skipped = 0;

  rawItems.forEach((raw, index) => {
    const docId =
      raw && typeof raw === 'object' && typeof raw.id === 'string' ? raw.id.trim() : undefined;
    const product = mapCatalogProductToLocal(raw, index, docId || undefined);
    if (product) {
      mapped.push(product);
    } else {
      skipped += 1;
    }
  });

  if (mapped.length === 0) {
    throw new Error('Ningún producto de Firebase pudo interpretarse');
  }

  if (window.electronAPI?.syncProductosBatchLocal) {
    await window.electronAPI.syncProductosBatchLocal(mapped);
  } else {
    for (const product of mapped) {
      await upsertProducto(product);
    }
  }

  await setAppSetting('productosLastSyncAt', new Date().toISOString());

  return { imported: mapped.length, total: rawItems.length, skipped };
}

/** @typedef {{ imported: number; total: number; skipped?: number }} ProductosSyncResult */

/**
 * @param {{ reason?: 'startup' | 'interval' | 'view' | 'manual'; force?: boolean; notifyOnError?: boolean }} [options]
 * @returns {Promise<ProductosSyncResult | null>}
 */
export async function runAutoProductosSync(options = {}) {
  const { reason = 'interval', force = false, notifyOnError = reason === 'manual' } = options;

  if (!isFirebaseConfigured()) {
    return null;
  }

  if (!force && reason === 'view') {
    await loadAppSettings();
    const lastSyncAt = getCachedAppSettings().productosLastSyncAt;
    if (typeof lastSyncAt === 'string') {
      const elapsed = Date.now() - new Date(lastSyncAt).getTime();
      if (elapsed < 5 * 60 * 1000) {
        return { imported: 0, total: 0, skipped: 0 };
      }
    }
  }

  try {
    const result = await syncProductosFromFirebase();
    if (result.imported > 0) {
      console.log(
        `[productos-sync] ${reason}: ${result.imported} producto(s) desde Firebase` +
          (result.skipped ? ` (${result.skipped} omitido(s))` : '')
      );
    }
    return result;
  } catch (error) {
    console.warn('[productos-sync]', error);
    if (notifyOnError) {
      throw error;
    }
    return { imported: 0, total: 0, skipped: 0 };
  }
}
