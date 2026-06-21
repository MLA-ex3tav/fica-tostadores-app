/** @typedef {{ id: string; label: string }} EtapaProduccion */

/** @type {EtapaProduccion[]} */
export const DEFAULT_ETAPAS_PRODUCCION = [
  { id: 'pendiente_fabricacion', label: 'Pendiente fabricación' },
  { id: 'corte', label: 'Corte' },
  { id: 'soldadura', label: 'Soldadura' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'control_calidad', label: 'Control de calidad' },
  { id: 'listo_entrega', label: 'Listo para entrega' },
];

/**
 * @param {string | null | undefined} etapaId
 * @param {EtapaProduccion[]} [etapas]
 * @returns {string}
 */
export function getEtapaLabel(etapaId, etapas = DEFAULT_ETAPAS_PRODUCCION) {
  if (!etapaId) return 'Sin etapa';
  const found = etapas.find((entry) => entry.id === etapaId);
  return found?.label ?? etapaId;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {Record<string, unknown>}
 */
export function parseProduccion(item) {
  const raw = item.produccion;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  return {};
}
