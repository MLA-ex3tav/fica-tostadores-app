import { mapSolicitudToCard, parsePricing, deleteSolicitud } from '../services/cotizaciones.js';
import { formatFirestoreError } from '../firebase/errors.js';
import { formatQuoteMoney } from './quote-pdf-template.js';
import { initOTDetail, openOTDetail, closeOTDetail, isOTDetailOpen } from './ot-detail.js';
import { confirmDialog, showToast } from './app-alerts.js';
import { renderActionBar, renderActionButton, ActionIcons } from './action-buttons.js';
import { renderLucideIcon, StateIcons } from './lucide-icons.js';
import { parseProduccion, getEtapaLabel } from '../services/produccion.js';

/** @type {HTMLElement | null} */
let container = null;

/** @type {HTMLElement | null} */
let errorContainer = null;

/** @type {HTMLElement | null} */
let panelRoot = null;

/** @type {Array<{id: string} & Record<string, unknown>>} */
let lastItems = [];

/**
 * @param {import('firebase/firestore').Timestamp | Date | string | undefined} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) return '—';

  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  if (value instanceof Date) {
    return value.toLocaleDateString('es-AR');
  }

  return String(value);
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * @param {string} id
 * @param {HTMLElement} [trigger]
 */
async function handleDeleteOT(id, trigger) {
  const item = lastItems.find((entry) => entry.id === id);
  if (!item) {
    showOTError('No se encontró la orden de trabajo.');
    return;
  }

  const cliente = mapSolicitudToCard(item).cliente ?? 'esta orden';
  const confirmed = await confirmDialog({
    title: 'Eliminar orden de trabajo',
    message: `¿Eliminar la orden de trabajo de ${cliente}? Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
    variant: 'danger',
  });
  if (!confirmed) return;

  if (trigger instanceof HTMLButtonElement) {
    trigger.disabled = true;
  }

  try {
    await deleteSolicitud(id);
    showOTSuccess('Orden de trabajo eliminada localmente. Se sincronizará con Firebase automáticamente.');
  } catch (error) {
    console.error('[ot-view]', error);
    showOTError(formatFirestoreError(error));
  } finally {
    if (trigger instanceof HTMLButtonElement) {
      trigger.disabled = false;
    }
  }
}

/**
 * @param {string} id
 */
function openDetailById(id) {
  const item = lastItems.find((entry) => entry.id === id);
  if (!item) {
    showOTError('No se encontró la orden de trabajo.');
    return;
  }

  try {
    void openOTDetail(item, {
      onBack: () => clearError(),
      onFinalized: () => showOTSuccess('Orden finalizada localmente. Se sincronizará con Firebase automáticamente.'),
      onDeleted: () => showOTSuccess('Orden de trabajo eliminada localmente. Se sincronizará con Firebase automáticamente.'),
    });
  } catch (error) {
    console.error('[ot-view]', error);
    showOTError(error instanceof Error ? error.message : 'No se pudo abrir el detalle.');
  }
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @returns {string}
 */
function renderOTCard(rawItem) {
  const item = mapSolicitudToCard(rawItem);
  const pricing = parsePricing(rawItem);
  const aprobadaAt = rawItem.aprobadaAt ?? rawItem.createdAt;

  const produccion = parseProduccion(rawItem);
  const etapaLabel = getEtapaLabel(typeof produccion.etapa === 'string' ? produccion.etapa : null);

  return `
    <article class="ot-item ot-item--clickable" data-id="${escapeHtml(rawItem.id)}" role="button" tabindex="0">
      ${renderLucideIcon(StateIcons.emptyOt, { width: 20, height: 20 })}
      <div class="ot-item__info">
        <div class="ot-item__title">${escapeHtml(String(item.cliente ?? 'Sin cliente'))}</div>
        <div class="ot-item__meta">
          ${escapeHtml(String(item.producto ?? '—'))}
          · Aprobada ${formatDate(aprobadaAt)}
          ${pricing.precioTotal != null ? ` · Total $ ${formatQuoteMoney(pricing.precioTotal)}` : ''}
        </div>
        ${item.email ? `<div class="ot-item__meta">${escapeHtml(String(item.email))}</div>` : ''}
      </div>
      <div class="ot-item__aside">
        <span class="ot-item__badge">${escapeHtml(etapaLabel)}</span>
        ${renderActionBar(
          [
            renderActionButton({
              action: 'eliminar',
              id: rawItem.id,
              label: 'Eliminar',
              icon: ActionIcons.delete,
              variant: 'danger',
            }),
          ].join('')
        )}
      </div>
    </article>
  `;
}

function bindPanelActions() {
  if (!panelRoot || panelRoot.dataset.bound === 'true') return;

  panelRoot.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest('[data-action="eliminar"]');
    if (button instanceof HTMLElement && button.dataset.id) {
      event.preventDefault();
      event.stopPropagation();
      void handleDeleteOT(button.dataset.id, button);
      return;
    }

    const card = target.closest('.ot-item--clickable');
    if (card instanceof HTMLElement && card.dataset.id) {
      openDetailById(card.dataset.id);
    }
  });

  panelRoot.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-action]')) return;

    const card = target.closest('.ot-item--clickable');
    if (card instanceof HTMLElement && card.dataset.id) {
      event.preventDefault();
      openDetailById(card.dataset.id);
    }
  });

  panelRoot.dataset.bound = 'true';
}

function renderCards(items) {
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="ot-item ot-item--empty">
        ${renderLucideIcon(StateIcons.emptyOt, { width: 20, height: 20 })}
        <div class="ot-item__info">
          <div class="ot-item__title">Sin órdenes activas</div>
          <div class="ot-item__meta">Las OT aprobadas desde Cotizaciones aparecerán aquí</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(renderOTCard).join('');
}

/**
 * @param {Array<{id: string} & Record<string, unknown>>} items
 */
export function renderOrdenesTrabajo(items) {
  lastItems = items;

  if (isOTDetailOpen()) {
    return;
  }

  clearError();
  renderCards(items);
}

/**
 * @param {string} message
 * @param {{ persistent?: boolean }} [options]
 */
export function showOTError(message, options = {}) {
  if (options.persistent && errorContainer) {
    errorContainer.innerHTML = `<div class="error-banner">${escapeHtml(message)}</div>`;
    return;
  }
  showToast({ message, variant: 'error', duration: 6000 });
}

/**
 * @param {string} message
 */
export function showOTSuccess(message) {
  showToast({ message, variant: 'success' });
}

export function clearError() {
  if (errorContainer) {
    errorContainer.innerHTML = '';
  }
}

export function showOTLoading() {
  if (!container || isOTDetailOpen()) return;
  container.innerHTML = `
    <div class="loading-spinner">
      ${renderLucideIcon(StateIcons.loading, { width: 24, height: 24, spin: true })}
      Cargando órdenes de trabajo…
    </div>
  `;
}

export function initOTView() {
  container = document.getElementById('ot-list');
  errorContainer = document.getElementById('ot-error');
  panelRoot = document.getElementById('ot-panel');
  const detailContainer = document.getElementById('ot-detail');

  initOTDetail({
    detailContainer,
    listContainer: container,
  });

  bindPanelActions();
  showOTLoading();
}

export function closeOrdenTrabajoDetail() {
  closeOTDetail();
}
