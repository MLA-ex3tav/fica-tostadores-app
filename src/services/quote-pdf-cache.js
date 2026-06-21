/** @type {Map<string, { base64: string; fingerprint: string }>} */
const cache = new Map();

/** @type {Set<string>} */
const generating = new Set();

/** @type {Map<string, Promise<string | null>>} */
const inFlight = new Map();

/** @type {Map<string, 'generating' | 'ready' | 'pending-prices' | 'error'>} */
const statusById = new Map();

/** @type {Set<(id: string, status: string) => void>} */
const listeners = new Set();

/**
 * @param {string} id
 * @param {'generating' | 'ready' | 'pending-prices' | 'error'} status
 */
function setStatus(id, status) {
  statusById.set(id, status);
  listeners.forEach((fn) => fn(id, status));
}

/**
 * @param {(id: string, status: string) => void} fn
 * @returns {() => void}
 */
export function onPdfCacheStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {string} id
 * @returns {'generating' | 'ready' | 'pending-prices' | 'error' | undefined}
 */
export function getPdfStatus(id) {
  return statusById.get(id);
}

/**
 * @param {string} id
 * @param {string} fingerprint
 * @returns {string | null}
 */
export function getCachedPdf(id, fingerprint) {
  const entry = cache.get(id);
  if (!entry || entry.fingerprint !== fingerprint) return null;
  return entry.base64;
}

/**
 * @param {string} id
 * @param {string} fingerprint
 * @param {string} base64
 */
export function setCachedPdf(id, fingerprint, base64) {
  cache.set(id, { base64, fingerprint });
  setStatus(id, 'ready');
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isPdfGenerating(id) {
  return generating.has(id);
}

/**
 * @param {string} id
 * @param {string} fingerprint
 * @param {() => Promise<string | null>} factory
 * @returns {Promise<string | null>}
 */
export async function ensurePdf(id, fingerprint, factory) {
  const cached = getCachedPdf(id, fingerprint);
  if (cached) {
    return cached;
  }

  const pending = inFlight.get(id);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    generating.add(id);
    setStatus(id, 'generating');

    try {
      const base64 = await factory();
      if (base64) {
        setCachedPdf(id, fingerprint, base64);
        return base64;
      }
      setStatus(id, 'error');
      return null;
    } catch (error) {
      console.error('[quote-pdf-cache]', error);
      setStatus(id, 'error');
      throw error;
    } finally {
      generating.delete(id);
      inFlight.delete(id);
    }
  })();

  inFlight.set(id, task);
  return task;
}

/**
 * @param {string} id
 */
export function markPendingPrices(id) {
  setStatus(id, 'pending-prices');
}

/**
 * @param {string} id
 */
export function clearPdfCacheForSolicitud(id) {
  cache.delete(id);
  generating.delete(id);
  inFlight.delete(id);
  statusById.delete(id);
}
