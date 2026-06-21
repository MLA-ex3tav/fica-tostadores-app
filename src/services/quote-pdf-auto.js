import {
  mapSolicitudToDetail,
  parsePricing,
  hasPricingReady,
  getPricingFingerprint,
} from './cotizaciones.js';
import {
  ensurePdf,
  getCachedPdf,
  setCachedPdf,
  markPendingPrices,
  getPdfStatus,
} from './quote-pdf-cache.js';
import { generateQuotePdfBuffer, openPdfPreview } from '../ui/pdf-preview.js';
import { printPdfFromBase64 } from './pdf.js';

/** @type {Set<string>} */
const seenIds = new Set();

/** @type {(() => void) | null} */
let onListRefresh = null;

/**
 * @param {() => void} fn
 */
export function setPdfListRefreshHandler(fn) {
  onListRefresh = fn;
}

/**
 * @param {{id: string} & Record<string, unknown>} item
 * @returns {string}
 */
export function getQuoteFileName(item) {
  const detail = mapSolicitudToDetail(item);
  return `cotizacion-${String(detail.cliente).replace(/\s+/g, '-').toLowerCase()}.pdf`;
}

/**
 * @param {{id: string} & Record<string, unknown>} item
 * @returns {Promise<string | null>}
 */
export async function ensureQuotePdf(item) {
  const pricing = parsePricing(item);

  if (!hasPricingReady(item)) {
    markPendingPrices(item.id);
    return null;
  }

  const fingerprint = getPricingFingerprint(item);
  const cached = getCachedPdf(item.id, fingerprint);
  if (cached) return cached;

  const detail = mapSolicitudToDetail(item);
  const precioFinal = pricing.precioFinal ?? 0;

  return ensurePdf(item.id, fingerprint, async () => {
    const base64 = await generateQuotePdfBuffer(detail, {
      precioFinal,
      envio: pricing.envio,
    });
    return base64;
  });
}

/**
 * @param {{id: string} & Record<string, unknown>} item
 * @returns {Promise<void>}
 */
export async function printQuotePdf(item) {
  const base64 = await ensureQuotePdf(item);
  if (!base64) {
    throw new Error('No hay PDF disponible para imprimir.');
  }

  await printPdfFromBase64(base64);
}

/**
 * @param {{id: string} & Record<string, unknown>} item
 * @param {{ onClose?: () => void }} [options]
 */
export async function openQuotePdfPreview(item, options = {}) {
  let base64;
  try {
    base64 = await ensureQuotePdf(item);
  } catch (error) {
    throw new Error('No se pudo generar el PDF. Intenta de nuevo.');
  }

  if (!base64) {
    throw new Error('El PDF aún se está generando. Espera unos segundos e intenta de nuevo.');
  }

  await openPdfPreview(base64, getQuoteFileName(item), {
    onClose: options.onClose,
  });
}

/**
 * @param {Array<{id: string} & Record<string, unknown>>} items
 */
export function processIncomingOrders(items) {
  for (const item of items) {
    seenIds.add(item.id);

    if (!hasPricingReady(item)) {
      markPendingPrices(item.id);
    }
  }
}

/**
 * @param {{id: string} & Record<string, unknown>} item
 * @returns {'generating' | 'ready' | 'pending-prices' | 'error' | 'unknown'}
 */
export function getOrderPdfStatus(item) {
  const status = getPdfStatus(item.id);
  if (status) return status;

  const pricing = parsePricing(item);
  if (!hasPricingReady(item)) return 'pending-prices';

  const fingerprint = getPricingFingerprint(item);
  if (getCachedPdf(item.id, fingerprint)) return 'ready';

  return 'unknown';
}
