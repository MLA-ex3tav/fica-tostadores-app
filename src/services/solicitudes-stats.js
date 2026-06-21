import {
  subscribeAllSolicitudes,
  isSolicitudPendiente,
  isSolicitudAprobadaOT,
  parsePricing,
  parseProductsList,
  getSolicitudMillis,
  mapSolicitudToCard,
} from './cotizaciones.js';

/** @typedef {{ start: number; end: number }} DateRange */

const ESTADOS_HISTORIAL = new Set(['en_cotizacion', 'completada', 'rechazada']);

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  nueva: 'Nueva',
  en_cotizacion: 'En cotización',
  aprobada_ot: 'OT activa',
  completada: 'Completada',
  rechazada: 'Rechazada',
};

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function getEstadoLabel(item) {
  const estado = item.estado;
  if (estado === undefined || estado === null || estado === '') {
    return ESTADO_LABELS.pendiente;
  }
  if (typeof estado === 'string' && estado in ESTADO_LABELS) {
    return ESTADO_LABELS[/** @type {keyof typeof ESTADO_LABELS} */ (estado)];
  }
  return String(estado);
}

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
function resolveEstadoKey(item) {
  if (isSolicitudPendiente(item)) {
    const estado = item.estado;
    if (estado === 'nueva') return 'nueva';
    return 'pendiente';
  }
  return typeof item.estado === 'string' ? item.estado : 'pendiente';
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @returns {Record<string, number>}
 */
export function countByEstado(items) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const item of items) {
    const key = resolveEstadoKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @param {Date} [referenceDate]
 * @returns {number}
 */
export function sumIngresosMes(items, referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  let total = 0;

  for (const item of items) {
    if (item.estado !== 'completada') continue;
    const completedMs = getSolicitudMillis(item.completadaAt ?? item.createdAt);
    if (!completedMs) continue;

    const completed = new Date(completedMs);
    if (completed.getFullYear() !== year || completed.getMonth() !== month) continue;

    const pricing = parsePricing(item);
    if (pricing.precioTotal != null) {
      total += pricing.precioTotal;
    }
  }

  return total;
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @param {DateRange} [range]
 * @returns {number}
 */
export function sumIngresosPeriodo(items, range) {
  let total = 0;

  for (const item of items) {
    if (item.estado !== 'completada') continue;
    const completedMs = getSolicitudMillis(item.completadaAt ?? item.createdAt);
    if (range && (completedMs < range.start || completedMs > range.end)) continue;

    const pricing = parsePricing(item);
    if (pricing.precioTotal != null) {
      total += pricing.precioTotal;
    }
  }

  return total;
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @param {{ estados?: string[]; dateRange?: DateRange; query?: string }} [filters]
 * @returns {Array<{ id: string } & Record<string, unknown>>}
 */
export function filterHistorial(items, filters = {}) {
  const estados = filters.estados ?? [...ESTADOS_HISTORIAL];
  const estadoSet = new Set(estados);
  const query = filters.query?.trim().toLowerCase() ?? '';

  return items.filter((item) => {
    const estado = typeof item.estado === 'string' ? item.estado : 'pendiente';
    if (!estadoSet.has(estado)) return false;

    if (filters.dateRange) {
      const ms = getSolicitudMillis(item.completadaAt ?? item.createdAt);
      if (ms < filters.dateRange.start || ms > filters.dateRange.end) return false;
    }

    if (query) {
      const card = mapSolicitudToCard(item);
      const haystack = [card.cliente, card.email, card.producto, card.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @param {number} [limit]
 * @returns {Array<{ name: string; count: number }>}
 */
export function topProductos(items, limit = 10) {
  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const item of items) {
    const products = parseProductsList(item.products ?? item.selectedProducts ?? item.items);
    for (const product of products) {
      const name = product.nombre?.trim() || 'Producto';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @param {DateRange} [range]
 * @returns {{ aprobadas: number; rechazadas: number; completadas: number }}
 */
export function countAprobacionesRechazos(items, range) {
  let aprobadas = 0;
  let rechazadas = 0;
  let completadas = 0;

  for (const item of items) {
    const ms = getSolicitudMillis(item.aprobadaAt ?? item.rechazadaAt ?? item.completadaAt ?? item.createdAt);
    if (range && (ms < range.start || ms > range.end)) continue;

    switch (item.estado) {
      case 'aprobada_ot':
        aprobadas += 1;
        break;
      case 'completada':
        completadas += 1;
        aprobadas += 1;
        break;
      case 'rechazada':
        rechazadas += 1;
        break;
      default:
        break;
    }
  }

  return { aprobadas, rechazadas, completadas };
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @param {DateRange} [range]
 * @returns {Array<{ month: string; total: number }>}
 */
export function ingresosPorMes(items, range) {
  /** @type {Map<string, number>} */
  const byMonth = new Map();

  for (const item of items) {
    if (item.estado !== 'completada') continue;
    const ms = getSolicitudMillis(item.completadaAt ?? item.createdAt);
    if (!ms) continue;
    if (range && (ms < range.start || ms > range.end)) continue;

    const date = new Date(ms);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const pricing = parsePricing(item);
    if (pricing.precioTotal == null) continue;
    byMonth.set(key, (byMonth.get(key) ?? 0) + pricing.precioTotal);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));
}

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @returns {{ pendientes: number; otActivas: number; ingresosMes: number }}
 */
export function computeDashboardKpis(items) {
  return {
    pendientes: items.filter(isSolicitudPendiente).length,
    otActivas: items.filter(isSolicitudAprobadaOT).length,
    ingresosMes: sumIngresosMes(items),
  };
}

export { subscribeAllSolicitudes, ESTADOS_HISTORIAL, ESTADO_LABELS };
