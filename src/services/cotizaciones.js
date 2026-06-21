import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { getDb } from '../firebase/init.js';
import { clearPdfCacheForSolicitud } from './quote-pdf-cache.js';
import {
  importFromFirebaseLocal,
  updateSolicitudLocal,
  deleteSolicitudLocalSoft,
  purgeSolicitudLocal,
  markSolicitudSyncedLocal,
  listPendingSyncLocal,
  countPendingSyncLocal,
  isLocalDbAvailable,
  listAllSolicitudesLocal,
} from './local-db.js';

const COLLECTION = 'solicitudes_cotizacion';

/** @type {(() => void) | null} */
let firestoreSyncUnsubscribe = null;

/** @typedef {'pendientes' | 'ot' | 'all'} SolicitudesFilter */

/** @type {Set<{ filter: SolicitudesFilter; onData: (items: Array<{ id: string } & Record<string, unknown>>) => void; onError: (error: Error) => void }>} */
const localSubscribers = new Set();

/** @type {Set<(count: number) => void>} */
const pendingSyncListeners = new Set();

function nowIso() {
  return new Date().toISOString();
}

async function emitPendingSyncCount() {
  const count = await countPendingSyncLocal();
  pendingSyncListeners.forEach((listener) => listener(count));
}

/**
 * @param {(count: number) => void} listener
 * @returns {() => void}
 */
export function onPendingSyncCount(listener) {
  pendingSyncListeners.add(listener);
  void emitPendingSyncCount();
  return () => pendingSyncListeners.delete(listener);
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
async function patchSolicitudLocal(id, patch) {
  await updateSolicitudLocal(id, patch);
  await refreshLocalSubscribers();
  await emitPendingSyncCount();
}

const ESTADOS_CERRADOS = new Set(['en_cotizacion', 'aprobada_ot', 'rechazada', 'completada']);

/**
 * @param {Record<string, unknown>} item
 */
export function isSolicitudPendiente(item) {
  const estado = item.estado;
  if (estado === undefined || estado === null || estado === '') {
    return true;
  }
  if (typeof estado !== 'string') {
    return true;
  }
  switch (estado) {
    case 'pendiente':
    case 'nueva':
      return true;
    case 'en_cotizacion':
    case 'aprobada_ot':
    case 'rechazada':
    case 'completada':
      return false;
    default:
      return !ESTADOS_CERRADOS.has(estado);
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function getSolicitudMillis(value) {
  if (!value) return 0;
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    return Number(value.toMillis());
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return value.toDate().getTime();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    typeof /** @type {{ seconds: unknown }} */ (value).seconds === 'number'
  ) {
    return /** @type {{ seconds: number }} */ (value).seconds * 1000;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * @param {Array<{id: string} & Record<string, unknown>>} items
 */
function sortByCreatedAtDesc(items) {
  return items.sort((a, b) => {
    const aTime = getSolicitudMillis(a.createdAt ?? a.fecha ?? a.creadoEn);
    const bTime = getSolicitudMillis(b.createdAt ?? b.fecha ?? b.creadoEn);
    return bTime - aTime;
  });
}

/**
 * @param {Array<{id: string} & Record<string, unknown>>} items
 * @param {SolicitudesFilter} filter
 */
function filterSolicitudes(items, filter) {
  if (filter === 'all') {
    return items;
  }
  if (filter === 'pendientes') {
    return items.filter(isSolicitudPendiente);
  }
  return items.filter(isSolicitudAprobadaOT);
}

async function refreshLocalSubscribers() {
  let items;

  if (isLocalDbAvailable()) {
    items = await listAllSolicitudesLocal();
  } else if (lastFirestoreSnapshot.length > 0) {
    items = lastFirestoreSnapshot;
  } else {
    return;
  }

  for (const subscriber of localSubscribers) {
    try {
      const filtered = filterSolicitudes(items, subscriber.filter);
      subscriber.onData(sortByCreatedAtDesc([...filtered]));
    } catch (error) {
      subscriber.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** @type {Array<{id: string} & Record<string, unknown>>} */
let lastFirestoreSnapshot = [];

/**
 * @param {(error: Error) => void} onError
 */
function ensureFirestoreSync(onError) {
  if (firestoreSyncUnsubscribe) return;

  const db = getDb();
  if (!db) {
    onError(new Error('Firebase no está configurado'));
    return;
  }

  firestoreSyncUnsubscribe = onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => {
      lastFirestoreSnapshot = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const upserts = [];
      const removedIds = [];

      for (const change of snapshot.docChanges()) {
        if (change.type === 'removed') {
          removedIds.push(change.doc.id);
        } else {
          upserts.push({ id: change.doc.id, data: change.doc.data() });
        }
      }

      void (async () => {
        try {
          if (isLocalDbAvailable()) {
            await importFromFirebaseLocal(upserts, removedIds);
          }
          await refreshLocalSubscribers();
        } catch (error) {
          console.error('[local-sync]', error);
          try {
            await refreshLocalSubscribers();
          } catch (refreshError) {
            onError(refreshError instanceof Error ? refreshError : new Error(String(refreshError)));
          }
        }
      })();
    },
    (error) => {
      onError(error);
    }
  );
}

/**
 * @param {SolicitudesFilter} filter
 * @param {(items: Array<{id: string} & Record<string, unknown>>) => void} onData
 * @param {(error: Error) => void} onError
 * @returns {(() => void) | null}
 */
function subscribeSolicitudesLocal(filter, onData, onError) {
  if (!isLocalDbAvailable()) {
    onError(new Error('Base de datos local no disponible'));
    return null;
  }

  const subscriber = { filter, onData, onError };
  localSubscribers.add(subscriber);
  ensureFirestoreSync(onError);
  void refreshLocalSubscribers();
  void emitPendingSyncCount();

  return () => {
    localSubscribers.delete(subscriber);
    if (localSubscribers.size === 0 && firestoreSyncUnsubscribe) {
      firestoreSyncUnsubscribe();
      firestoreSyncUnsubscribe = null;
      lastFirestoreSnapshot = [];
    }
  };
}

/**
 * @param {(items: Array<{id: string} & Record<string, unknown>>) => void} onData
 * @param {(error: Error) => void} onError
 * @returns {(() => void) | null} Función de desuscripción
 */
export function subscribeCotizacionesPendientes(onData, onError) {
  return subscribeSolicitudesLocal('pendientes', onData, onError);
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function aprobarParaOT(id) {
  await patchSolicitudLocal(id, {
    estado: 'aprobada_ot',
    aprobadaAt: nowIso(),
  });
}

/**
 * @param {Record<string, unknown>} item
 */
export function isSolicitudAprobadaOT(item) {
  return item.estado === 'aprobada_ot';
}

/**
 * @param {(items: Array<{id: string} & Record<string, unknown>>) => void} onData
 * @param {(error: Error) => void} onError
 * @returns {(() => void) | null}
 */
export function subscribeOrdenesTrabajo(onData, onError) {
  return subscribeSolicitudesLocal('ot', onData, onError);
}

/**
 * @param {(items: Array<{id: string} & Record<string, unknown>>) => void} onData
 * @param {(error: Error) => void} onError
 * @returns {(() => void) | null}
 */
export function subscribeAllSolicitudes(onData, onError) {
  return subscribeSolicitudesLocal('all', onData, onError);
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteSolicitud(id) {
  if (!isLocalDbAvailable()) {
    throw new Error('Base de datos local no disponible');
  }

  await deleteSolicitudLocalSoft(id);
  clearPdfCacheForSolicitud(id);
  await refreshLocalSubscribers();
  await emitPendingSyncCount();
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function finalizarOrdenTrabajo(id) {
  await patchSolicitudLocal(id, {
    estado: 'completada',
    completadaAt: nowIso(),
  });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function rechazarSolicitud(id) {
  await patchSolicitudLocal(id, {
    estado: 'rechazada',
    rechazadaAt: nowIso(),
  });
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @returns {Promise<void>}
 */
export async function actualizarProduccionOT(id, patch) {
  const items = await listAllSolicitudesLocal();
  const current = items.find((entry) => entry.id === id);
  const existing =
    current?.produccion && typeof current.produccion === 'object' && !Array.isArray(current.produccion)
      ? /** @type {Record<string, unknown>} */ (current.produccion)
      : {};
  await patchSolicitudLocal(id, {
    produccion: { ...existing, ...patch },
  });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function marcarEnCotizacion(id) {
  await patchSolicitudLocal(id, {
    estado: 'en_cotizacion',
    cotizacionAt: nowIso(),
  });
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function getRecord(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return /** @type {Record<string, unknown>} */ (value);
  }
  return {};
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {string | null}
 */
function formatAddressFromObject(obj) {
  const parts = [
    obj.addressLine1 ?? obj.line1 ?? obj.direccion ?? obj.address,
    obj.addressLine2 ?? obj.line2,
    obj.city ?? obj.ciudad,
    obj.state ?? obj.region,
    obj.country ?? obj.pais,
  ].filter((part) => part != null && part !== '');

  return parts.length > 0 ? parts.map(String).join(', ') : null;
}

/**
 * Contacto y envío embebidos en solicitudes_cotizacion (no clientes/{uid}).
 * @param {Record<string, unknown>} item
 */
function parseContactFromSolicitud(item) {
  const contact = getRecord(item.contact);
  const shipping = getRecord(item.shipping);
  const shippingAddress = getRecord(shipping.address ?? item.shippingAddress);
  const profile = getRecord(item.shippingProfile);

  const cliente =
    pickString(
      contact.name ??
        contact.contactName ??
        profile.contactName ??
        contact.nombre ??
        contact.displayName ??
        item.clientName ??
        item.contactName ??
        item.nombre ??
        item.displayName ??
        item.nombreCliente
    ) ?? 'Sin cliente';

  const region = pickString(
    shippingAddress.region ??
      profile.region ??
      contact.region ??
      shipping.region ??
      item.region
  );

  const ciudad = pickString(
    shippingAddress.city ?? profile.city ?? shipping.city ?? contact.city ?? item.city ?? item.ciudad
  );

  return {
    cliente,
    email: pickString(
      contact.email ?? profile.email ?? item.clientEmail ?? item.email ?? item.correo
    ),
    telefono: pickString(
      contact.phone ??
        profile.phone ??
        contact.telephone ??
        contact.telefono ??
        item.clientPhone ??
        item.phone ??
        item.telefono
    ),
    direccion:
      formatAddressFromObject(shippingAddress) ??
      formatAddressFromObject(profile) ??
      formatAddressFromObject(shipping) ??
      formatAddressFromObject(contact) ??
      pickString(item.direccion ?? item.address ?? item.clientAddress),
    pais: pickString(
      shippingAddress.country ??
        profile.country ??
        shipping.country ??
        contact.country ??
        item.country ??
        item.pais ??
        item.clientCountry
    ),
    ciudad,
    region,
    cuit: pickString(
      contact.taxId ?? contact.cuit ?? contact.rut ?? contact.dni ?? contact.ruc ?? item.cuit ?? item.dni
    ),
    zipDestino: pickString(
      shippingAddress.postalCode ??
        shippingAddress.zipCode ??
        profile.postalCode ??
        shipping.postalCode ??
        shipping.zipCode ??
        contact.postalCode ??
        item.postalCode ??
        item.zipDestino
    ),
    clientUid: pickString(item.clientUid ?? item.uid ?? profile.uid ?? item.userId ?? item.clienteUid),
    shippingEnabled: Boolean(
      shipping.enabled ??
        shipping.requested ??
        shipping.include ??
        (parseNumber(shipping.cost ?? shipping.costo) ?? 0) > 0
    ),
    notas: pickString(
      item.message ??
        item.mensaje ??
        item.notas ??
        contact.message ??
        contact.notes ??
        item.observaciones
    ),
  };
}

/**
 * @param {Record<string, unknown>} item
 * @returns {{ precioFinal: number | null; envio: number; precioTotal: number | null; shippingEnabled: boolean }}
 */
export function parsePricing(item) {
  const pricingBlock = getRecord(item.pricing);
  const shipping = getRecord(item.shipping);

  let precioFinal = parseNumber(
    pricingBlock.subtotal ??
      pricingBlock.subTotal ??
      pricingBlock.precioFinal ??
      pricingBlock.machinesTotal ??
      item.subtotal ??
      item.precioFinal ??
      item.precioMaquinaria ??
      item.monto
  );

  const envio =
    parseNumber(
      pricingBlock.shipping ??
        pricingBlock.envio ??
        pricingBlock.shippingCost ??
        shipping.cost ??
        shipping.costo ??
        shipping.price ??
        item.envio ??
        item.costoEnvio ??
        item.shippingCost
    ) ?? 0;

  let precioTotal = parseNumber(
    pricingBlock.total ?? pricingBlock.precioTotal ?? item.precioTotal ?? item.total
  );

  const rawProducts = item.products ?? item.selectedProducts ?? item.items ?? item.producto;
  const products = parseProductsList(rawProducts);
  const productsSubtotal = products.reduce((sum, product) => sum + (product.precioTotal ?? 0), 0);

  if (precioFinal == null && productsSubtotal > 0) {
    precioFinal = productsSubtotal;
  }

  if (precioTotal == null && precioFinal != null) {
    precioTotal = precioFinal + envio;
  }

  return {
    precioFinal,
    envio,
    precioTotal,
    shippingEnabled: Boolean(
      shipping.enabled ??
        shipping.requested ??
        pricingBlock.shippingIncluded ??
        envio > 0
    ),
  };
}

/**
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
export function hasPricingReady(item) {
  const pricing = parsePricing(item);
  if (pricing.precioFinal != null && pricing.precioFinal >= 0) return true;
  if (pricing.precioTotal != null && pricing.precioTotal > 0) return true;

  const products = parseProductsList(item.products ?? item.selectedProducts ?? item.items);
  return products.some((product) => (product.precioTotal ?? 0) > 0);
}

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function getPricingFingerprint(item) {
  return JSON.stringify({
    pricing: parsePricing(item),
    products: item.products ?? item.selectedProducts ?? item.items,
    contact: item.contact ?? {
      clientName: item.clientName,
      clientEmail: item.clientEmail,
    },
    shipping: item.shipping,
  });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function marcarPdfRevisado(id) {
  await patchSolicitudLocal(id, {
    pdfRevisadoAt: nowIso(),
    estado: 'en_cotizacion',
    cotizacionAt: nowIso(),
  });
}

/**
 * @param {string} id
 * @param {{ precioFinal: number; envio: number }} cotizacion
 * @returns {Promise<void>}
 */
export async function finalizeCotizacion(id, cotizacion) {
  const { precioFinal, envio } = cotizacion;
  await patchSolicitudLocal(id, {
    estado: 'en_cotizacion',
    precioFinal,
    envio,
    precioTotal: precioFinal + envio,
    cotizacionAt: nowIso(),
    cotizacionFinalizadaAt: nowIso(),
  });
}

/**
 * @typedef {{
 *   cliente?: string;
 *   email?: string | null;
 *   telefono?: string | null;
 *   notas?: string | null;
 *   precioFinal?: number | null;
 *   envio?: number | null;
 *   products?: ProductRow[];
 * }} CotizacionEditInput
 */

/**
 * @param {ProductRow[]} products
 * @returns {Array<Record<string, unknown>>}
 */
export function serializeProductsForSolicitud(products) {
  return products.map((product) => {
    const qty = Number(product.cantidad) || 1;
    const unitPrice = product.precioUnitario ?? null;
    const lineTotal =
      product.precioTotal ?? (unitPrice != null ? unitPrice * qty : null);

    return {
      id: product.codigo ?? undefined,
      name: product.nombre,
      quantity: qty,
      unitPrice,
      lineTotal,
      capacity: product.capacidad ?? undefined,
      model: product.modelo ?? undefined,
      code: product.codigo ?? undefined,
      description: product.descripcion ?? undefined,
    };
  });
}

/**
 * @param {ProductRow[]} products
 * @returns {number}
 */
export function sumProductsSubtotal(products) {
  return products.reduce((sum, product) => {
    const qty = Number(product.cantidad) || 1;
    const line =
      product.precioTotal ??
      (product.precioUnitario != null ? product.precioUnitario * qty : 0);
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);
}

/**
 * @param {string} id
 * @param {CotizacionEditInput} changes
 * @param {Record<string, unknown>} currentItem
 * @returns {Promise<Record<string, unknown>>}
 */
export async function updateCotizacionSolicitud(id, changes, currentItem) {
  const contact = getRecord(currentItem.contact);
  const shipping = getRecord(currentItem.shipping);
  const shippingAddress = getRecord(shipping.address);
  const pricing = getRecord(currentItem.pricing);

  const hasProducts = Array.isArray(changes.products) && changes.products.length > 0;
  const serializedProducts = hasProducts ? serializeProductsForSolicitud(changes.products) : null;
  const productsSubtotal = hasProducts ? sumProductsSubtotal(changes.products) : null;

  const precioFinal = hasProducts
    ? productsSubtotal
    : changes.precioFinal !== undefined && changes.precioFinal !== null
      ? Number(changes.precioFinal)
      : parseNumber(
          pricing.subtotal ?? pricing.precioFinal ?? currentItem.precioFinal ?? currentItem.subtotal
        );

  const envio =
    changes.envio !== undefined && changes.envio !== null
      ? Number(changes.envio)
      : (parseNumber(
          pricing.shipping ?? pricing.envio ?? shipping.cost ?? currentItem.envio ?? currentItem.costoEnvio
        ) ?? 0);

  const precioTotal =
    precioFinal != null && Number.isFinite(precioFinal) ? precioFinal + envio : null;

  const patch = {
    contact: {
      ...contact,
      ...(changes.cliente != null ? { name: changes.cliente } : {}),
      ...(changes.email !== undefined ? { email: changes.email || null } : {}),
      ...(changes.telefono !== undefined ? { phone: changes.telefono || null } : {}),
    },
    shipping: {
      ...shipping,
      cost: envio,
      enabled: envio > 0,
      address: {
        ...shippingAddress,
      },
    },
    pricing: {
      ...pricing,
      ...(precioFinal != null ? { subtotal: precioFinal, precioFinal } : {}),
      shipping: envio,
      ...(precioTotal != null ? { total: precioTotal, precioTotal } : {}),
    },
    ...(serializedProducts
      ? { products: serializedProducts, selectedProducts: serializedProducts }
      : {}),
    ...(changes.notas !== undefined
      ? { message: changes.notas || null, notas: changes.notas || null }
      : {}),
    ...(precioFinal != null ? { precioFinal, subtotal: precioFinal } : {}),
    envio,
    ...(precioTotal != null ? { precioTotal, total: precioTotal } : {}),
  };

  await patchSolicitudLocal(id, patch);
  clearPdfCacheForSolicitud(id);

  return { ...currentItem, ...patch };
}

/**
 * Sube a Firebase los cambios locales pendientes (dirty / delete_pending).
 * @returns {Promise<{ synced: number; failed: number; errors: Array<{ id: string; message: string }> }>}
 */
export async function syncPendingToFirebase() {
  const firestore = getDb();
  if (!firestore) {
    throw new Error('Firebase no está configurado');
  }

  const pending = await listPendingSyncLocal();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, errors: [] };
  }

  let synced = 0;
  /** @type {Array<{ id: string; message: string }>} */
  const errors = [];

  for (const entry of pending) {
    try {
      const ref = doc(firestore, COLLECTION, entry.id);

      if (entry.sync_status === 'delete_pending') {
        await deleteDoc(ref);
        await purgeSolicitudLocal(entry.id);
        clearPdfCacheForSolicitud(entry.id);
        synced += 1;
        continue;
      }

      if (entry.sync_status === 'dirty') {
        await updateDoc(ref, entry.data);
        await markSolicitudSyncedLocal(entry.id, entry.data);
        synced += 1;
      }
    } catch (error) {
      errors.push({
        id: entry.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await refreshLocalSubscribers();
  await emitPendingSyncCount();

  return { synced, failed: errors.length, errors };
}

/**
 * @typedef {{
 *   nombre: string;
 *   modelo: string | null;
 *   capacidad: string | null;
 *   cantidad: string | null;
 *   descripcion: string | null;
 *   codigo: string | null;
 *   precioUnitario: number | null;
 *   precioTotal: number | null;
 * }} ProductRow
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function pickString(value) {
  if (value == null || value === '') return null;
  return String(value);
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {ProductRow}
 */
function parseProductObject(obj) {
  const cantidadRaw = obj.quantity ?? obj.cantidad ?? obj.qty ?? 1;
  const cantidadNum = Number(cantidadRaw) || 1;
  const precioUnitario = parseNumber(
    obj.unitPrice ?? obj.valorUnidad ?? obj.precioUnitario ?? obj.price ?? obj.precio
  );
  const precioTotal = parseNumber(
    obj.lineTotal ?? obj.valorTotal ?? obj.total ?? obj.precioTotal ?? obj.totalPrice
  );

  return {
    nombre: pickString(obj.name ?? obj.nombre ?? obj.producto ?? obj.title) ?? 'Producto',
    modelo: pickString(obj.model ?? obj.modelo),
    capacidad: pickString(obj.capacity ?? obj.capacidad),
    cantidad: pickString(cantidadRaw),
    descripcion: pickString(obj.description ?? obj.descripcion ?? obj.specs ?? obj.especificaciones),
    codigo: pickString(obj.id ?? obj.productId ?? obj.codigo ?? obj.code ?? obj.sku),
    precioUnitario,
    precioTotal:
      precioTotal ??
      (precioUnitario != null ? precioUnitario * cantidadNum : null),
  };
}

/**
 * @param {unknown} products
 * @returns {ProductRow[]}
 */
export function parseProductsList(products) {
  if (products == null) return [];

  if (typeof products === 'string') {
    const trimmed = products.trim();
    return trimmed
      ? [{ nombre: trimmed, modelo: null, capacidad: null, cantidad: null, descripcion: null }]
      : [];
  }

  if (Array.isArray(products)) {
    return products.flatMap((entry) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        return trimmed
          ? [{ nombre: trimmed, modelo: null, capacidad: null, cantidad: null, descripcion: null }]
          : [];
      }
      if (entry && typeof entry === 'object') {
        return [parseProductObject(/** @type {Record<string, unknown>} */ (entry))];
      }
      return [];
    });
  }

  if (typeof products === 'object') {
    return parseProductsList(Object.values(products));
  }

  return [
    {
      nombre: String(products),
      modelo: null,
      capacidad: null,
      cantidad: null,
      descripcion: null,
    },
  ];
}

/**
 * @param {unknown} products
 * @returns {string}
 */
function formatProducts(products) {
  if (products == null) return '—';
  if (typeof products === 'string') return products;

  if (Array.isArray(products)) {
    if (products.length === 0) return '—';
    return products
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const obj = /** @type {Record<string, unknown>} */ (entry);
          return String(obj.name ?? obj.nombre ?? obj.producto ?? obj.title ?? 'Producto');
        }
        return String(entry);
      })
      .join(', ');
  }

  if (typeof products === 'object') {
    const values = Object.values(products);
    if (values.length === 0) return '—';
    return formatProducts(values);
  }

  return String(products);
}

/**
 * Normaliza campos de solicitudes_cotizacion al formato de la UI.
 * @param {Record<string, unknown>} item
 */
export function mapSolicitudToCard(item) {
  const contact = parseContactFromSolicitud(item);
  const rawProducts = item.products ?? item.selectedProducts ?? item.items ?? item.producto ?? item.descripcion ?? item.servicio;

  return {
    ...item,
    ...contact,
    producto: formatProducts(rawProducts),
    ...parsePricing(item),
    createdAt: item.createdAt ?? item.fecha ?? item.creadoEn,
  };
}

/**
 * @param {Record<string, unknown>} item
 */
export function mapSolicitudToDetail(item) {
  const base = mapSolicitudToCard(item);
  const rawProducts = item.products ?? item.selectedProducts ?? item.items ?? item.producto ?? item.descripcion ?? item.servicio;

  const destinoParts = [base.ciudad, base.region].filter(Boolean);

  return {
    ...base,
    empresa: pickString(item.empresa ?? item.company ?? item.razonSocial ?? item.clientCompany),
    origen: pickString(item.origen ?? item.origin),
    destino: pickString(item.destino ?? item.destination) ?? (destinoParts.length > 0 ? destinoParts.join(', ') : null),
    zipOrigen: pickString(item.zipOrigen ?? item.zipCode),
    productos: parseProductsList(rawProducts),
    quoteNumber: pickString(item.quoteNumber ?? item.numeroCotizacion ?? item.cotizacionNumero),
  };
}
