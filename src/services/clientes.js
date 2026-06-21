import {
  mapSolicitudToCard,
  mapSolicitudToDetail,
  parseProductsList,
  getSolicitudMillis,
} from './cotizaciones.js';

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
export function getClienteKey(item) {
  const detail = mapSolicitudToDetail(item);
  if (detail.clientUid) {
    return `uid:${String(detail.clientUid).toLowerCase()}`;
  }
  if (detail.email) {
    return `email:${String(detail.email).trim().toLowerCase()}`;
  }
  if (detail.cuit) {
    return `tax:${String(detail.cuit).trim().toLowerCase()}`;
  }
  return `name:${String(detail.cliente).trim().toLowerCase()}`;
}

/**
 * @typedef {{
 *   key: string;
 *   cliente: string;
 *   email: string | null;
 *   telefono: string | null;
 *   solicitudesCount: number;
 *   otCompletadas: number;
 *   ultimaActividadMs: number;
 *   reincidente: boolean;
 *   items: Array<{ id: string } & Record<string, unknown>>;
 * }} ClienteProfile
 */

/**
 * @param {Array<{ id: string } & Record<string, unknown>>} items
 * @returns {ClienteProfile[]}
 */
export function buildClienteProfiles(items) {
  /** @type {Map<string, ClienteProfile>} */
  const map = new Map();

  for (const item of items) {
    const key = getClienteKey(item);
    const card = mapSolicitudToCard(item);
    const activityMs = getSolicitudMillis(item.createdAt ?? item.fecha ?? item.creadoEn);

    let profile = map.get(key);
    if (!profile) {
      profile = {
        key,
        cliente: String(card.cliente ?? 'Sin cliente'),
        email: card.email ? String(card.email) : null,
        telefono: card.telefono ? String(card.telefono) : null,
        solicitudesCount: 0,
        otCompletadas: 0,
        ultimaActividadMs: 0,
        reincidente: false,
        items: [],
      };
      map.set(key, profile);
    }

    profile.solicitudesCount += 1;
    profile.items.push(item);
    if (activityMs > profile.ultimaActividadMs) {
      profile.ultimaActividadMs = activityMs;
    }
    if (item.estado === 'completada') {
      profile.otCompletadas += 1;
    }
  }

  const profiles = [...map.values()];
  for (const profile of profiles) {
    profile.reincidente = profile.solicitudesCount > 1;
    profile.items.sort(
      (a, b) =>
        getSolicitudMillis(b.createdAt ?? b.fecha) - getSolicitudMillis(a.createdAt ?? a.fecha)
    );
  }

  return profiles.sort((a, b) => b.ultimaActividadMs - a.ultimaActividadMs);
}

/**
 * @param {ClienteProfile} profile
 * @returns {Array<{ nombre: string; cantidad: string | null; solicitudId: string }>}
 */
export function getMaquinasCompradas(profile) {
  /** @type {Array<{ nombre: string; cantidad: string | null; solicitudId: string }>} */
  const machines = [];

  for (const item of profile.items) {
    if (item.estado !== 'completada') continue;
    const products = parseProductsList(item.products ?? item.selectedProducts ?? item.items);
    for (const product of products) {
      machines.push({
        nombre: product.nombre,
        cantidad: product.cantidad,
        solicitudId: item.id,
      });
    }
  }

  return machines;
}
