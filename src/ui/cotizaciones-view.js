import { aprobarParaOT, deleteSolicitud, rechazarSolicitud, mapSolicitudToCard, parsePricing, hasPricingReady } from '../services/cotizaciones.js';

import { formatFirestoreError } from '../firebase/errors.js';

import { formatQuoteMoney } from './quote-pdf-template.js';

import {

  initCotizacionDetail,

  openCotizacionDetail,

  closeCotizacionDetail,

  isDetailOpen,

} from './cotizacion-detail.js';

import {

  processIncomingOrders,

  openQuotePdfPreview,

  getOrderPdfStatus,

  setPdfListRefreshHandler,

} from '../services/quote-pdf-auto.js';

import { onPdfCacheStatus } from '../services/quote-pdf-cache.js';

import { confirmDialog, showToast } from './app-alerts.js';
import { setNavBadge } from './sidebar.js';
import { renderActionBar, renderActionButton, ActionIcons } from './action-buttons.js';
import { openCotizacionEditModal } from './cotizacion-edit.js';
import { renderLucideIcon, StateIcons } from './lucide-icons.js';



/** @type {HTMLElement | null} */

let container = null;



/** @type {HTMLElement | null} */

let errorContainer = null;



/** @type {Array<{id: string} & Record<string, unknown>>} */

let lastItems = [];



/**

 * @param {import('firebase/firestore').Timestamp | Date | string | undefined} value

 * @returns {string}

 */

function formatDate(value) {
  if (!value) return '—';

  /** @type {Date | null} */
  let date = null;

  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

 * @param {{id: string} & Record<string, unknown>} rawItem

 * @returns {string}

 */

function renderStatusBadge(rawItem) {
  const status = getOrderPdfStatus(rawItem);

  if (status === 'pending-prices') {
    return '';
  }

  switch (status) {
    case 'ready':
      return '<span class="card__badge card__badge--pdf-ready">PDF listo</span>';
    case 'generating':
      return '<span class="card__badge card__badge--pdf-generating">Generando PDF…</span>';
    case 'error':
      return '<span class="card__badge card__badge--pdf-error">Error PDF</span>';
    default:
      return '';
  }
}

function renderPricingSummary(rawItem) {
  if (!hasPricingReady(rawItem)) {
    return `
      <div class="cot-row__prices cot-row__prices--pending">
        <span class="cot-row__price cot-row__price--empty">Precios pendientes</span>
        <span class="cot-row__price-sub">Esperando cálculo desde la web</span>
      </div>`;
  }

  const pricing = parsePricing(rawItem);
  const maquinaria = pricing.precioFinal ?? 0;
  const envio = pricing.envio ?? 0;
  const envioHtml =
    envio > 0
      ? `<span class="cot-row__price-sub">+ $ ${formatQuoteMoney(envio)} envío</span>`
      : '<span class="cot-row__price-sub">Envío por definir</span>';

  return `
    <div class="cot-row__prices">
      <span class="cot-row__price">$ ${formatQuoteMoney(maquinaria)}</span>
      ${envioHtml}
    </div>`;
}

/**
 * @param {Array<{id: string} & Record<string, unknown>>} items
 */
function renderCards(items) {

  if (!container) return;



  if (items.length === 0) {

    container.innerHTML = `

      <div class="empty-state">

        ${renderLucideIcon(StateIcons.emptyQuotes, { width: 48, height: 48 })}

        <p>No hay cotizaciones pendientes</p>

      </div>

    `;

    return;

  }



  container.innerHTML = `<div class="cot-list">${items.map(renderCard).join('')}</div>`;

}



/**

 * @param {{id: string} & Record<string, unknown>} rawItem

 * @returns {string}

 */

function renderCard(rawItem) {
  const item = mapSolicitudToCard(rawItem);
  const canViewPdf = hasPricingReady(rawItem);
  const producto =
    item.producto && String(item.producto).trim() && String(item.producto) !== '—'
      ? String(item.producto)
      : 'Sin producto';
  const metaLine = [producto, formatDate(item.createdAt)].join(' · ');
  const contactLine = [item.email, item.telefono].filter(Boolean).map(String).join(' · ');

  return `
    <article class="cot-row cot-row--clickable" data-id="${item.id}" role="button" tabindex="0">
      <div class="cot-row__main">
        <div class="cot-row__header">
          <h3 class="cot-row__title">${escapeHtml(String(item.cliente ?? 'Sin cliente'))}</h3>
          ${renderStatusBadge(rawItem)}
        </div>
        <p class="cot-row__meta">${escapeHtml(metaLine)}</p>
        ${contactLine ? `<p class="cot-row__meta">${escapeHtml(contactLine)}</p>` : ''}
        ${renderPricingSummary(rawItem)}
      </div>
      ${renderActionBar(
        [
          renderActionButton({
            action: 'pdf',
            id: item.id,
            label: 'Ver PDF',
            icon: ActionIcons.pdf,
            disabled: !canViewPdf,
          }),
          renderActionButton({
            action: 'editar',
            id: item.id,
            label: 'Editar',
            icon: ActionIcons.edit,
          }),
          renderActionButton({
            action: 'aprobar',
            id: item.id,
            label: 'Aprobar OT',
            icon: ActionIcons.approve,
            variant: 'primary',
          }),
          renderActionButton({
            action: 'rechazar',
            id: item.id,
            label: 'Rechazar',
            icon: ActionIcons.reject,
          }),
          renderActionButton({
            action: 'eliminar',
            id: item.id,
            label: 'Eliminar',
            icon: ActionIcons.delete,
            variant: 'danger',
          }),
        ].join(''),
        'cot-row__actions'
      )}
    </article>
  `;
}



/**
 * @param {string} id
 */
function openDetailById(id) {
  const item = lastItems.find((entry) => entry.id === id);
  if (!item) return;

  openCotizacionDetail(item, {
    onBack: () => clearError(),
    onDeleted: () => showSuccess('Cotización eliminada localmente. Se sincronizará con Firebase automáticamente.'),
  });
}

function bindListActions() {
  if (!container || container.dataset.bound === 'true') return;

  container.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest('[data-action]');
    if (button instanceof HTMLButtonElement && button.dataset.id) {
      event.preventDefault();
      event.stopPropagation();

      const action = button.dataset.action;
      const id = button.dataset.id;
      const item = lastItems.find((entry) => entry.id === id);
      if (!item) return;

      if (action === 'pdf') {
        button.disabled = true;
        try {
          await openQuotePdfPreview(item);
        } catch (error) {
          console.error('[cotizaciones]', error);
          showError(error instanceof Error ? error.message : formatFirestoreError(error));
        } finally {
          button.disabled = false;
        }
        return;
      }

      if (action === 'editar') {
        openCotizacionEditModal(item, {
          onSaved: (updated) => {
            Object.assign(item, updated);
            if (isDetailOpen()) {
              openCotizacionDetail(item, {
                onBack: () => clearError(),
                onDeleted: () =>
                  showSuccess('Cotización eliminada localmente. Se sincronizará con Firebase automáticamente.'),
              });
            }
          },
        });
        return;
      }

      if (action === 'rechazar') {
        const cliente = mapSolicitudToCard(item).cliente ?? 'esta cotización';
        const confirmed = await confirmDialog({
          title: 'Rechazar cotización',
          message: `¿Rechazar la cotización de ${cliente}? Pasará al historial como rechazada.`,
          confirmLabel: 'Rechazar',
          cancelLabel: 'Cancelar',
          variant: 'warning',
        });
        if (!confirmed) return;

        button.disabled = true;
        try {
          await rechazarSolicitud(id);
          showSuccess('Cotización rechazada localmente. Se sincronizará con Firebase automáticamente.');
        } catch (error) {
          console.error('[cotizaciones]', error);
          showError(formatFirestoreError(error));
        } finally {
          button.disabled = false;
        }
        return;
      }

      if (action === 'eliminar') {
        const cliente = mapSolicitudToCard(item).cliente ?? 'esta cotización';
        const confirmed = await confirmDialog({
          title: 'Eliminar cotización',
          message: `¿Eliminar la cotización de ${cliente}? Esta acción no se puede deshacer.`,
          confirmLabel: 'Eliminar',
          cancelLabel: 'Cancelar',
          variant: 'danger',
        });
        if (!confirmed) return;

        button.disabled = true;
        try {
          await deleteSolicitud(id);
          showSuccess('Cotización eliminada localmente. Se sincronizará con Firebase automáticamente.');
        } catch (error) {
          console.error('[cotizaciones]', error);
          showError(formatFirestoreError(error));
        } finally {
          button.disabled = false;
        }
        return;
      }

      button.disabled = true;

      try {
        if (action === 'aprobar') {
          const cliente = mapSolicitudToCard(item).cliente ?? 'este cliente';
          const confirmed = await confirmDialog({
            title: 'Aprobar orden de trabajo',
            message: `¿Aprobar la cotización de ${cliente} como orden de trabajo? Pasará a la lista de OT en producción.`,
            confirmLabel: 'Aprobar',
            cancelLabel: 'Cancelar',
            variant: 'primary',
          });
          if (!confirmed) return;

          await aprobarParaOT(id);
          showSuccess('Orden de trabajo aprobada localmente. Se sincronizará con Firebase automáticamente.');
        }
      } catch (error) {
        console.error('[cotizaciones]', error);
        showError(formatFirestoreError(error));
      } finally {
        button.disabled = false;
      }

      return;
    }

    const row = target.closest('.cot-row--clickable');
    if (row instanceof HTMLElement && row.dataset.id) {
      openDetailById(row.dataset.id);
    }
  });

  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-action]')) return;

    const row = target.closest('.cot-row--clickable');
    if (row instanceof HTMLElement && row.dataset.id) {
      event.preventDefault();
      openDetailById(row.dataset.id);
    }
  });

  container.dataset.bound = 'true';
}



/**
 * @param {string} message
 * @param {{ persistent?: boolean }} [options]
 */
export function showError(message, options = {}) {
  if (options.persistent && errorContainer) {
    errorContainer.innerHTML = `<div class="error-banner">${escapeHtml(message)}</div>`;
    return;
  }
  showToast({ message, variant: 'error', duration: 6000 });
}

/**
 * @param {string} message
 */
export function showSuccess(message) {
  showToast({ message, variant: 'success' });
}



export function clearError() {

  if (errorContainer) {

    errorContainer.innerHTML = '';

  }

}



export function showLoading() {

  if (!container || isDetailOpen()) return;

  container.innerHTML = `

    <div class="loading-spinner">

      ${renderLucideIcon(StateIcons.loading, { width: 24, height: 24, spin: true })}

      Cargando cotizaciones…

    </div>

  `;

}



/**

 * @param {Array<{id: string} & Record<string, unknown>>} items

 */

export function renderCotizaciones(items) {

  lastItems = items;

  processIncomingOrders(items);



  if (isDetailOpen()) {

    return;

  }



  clearError();
  setNavBadge('cotizaciones', items.length);
  renderCards(items);

}



export function initCotizacionesView() {

  container = document.getElementById('cotizaciones-list');

  errorContainer = document.getElementById('cotizaciones-error');

  const detailContainer = document.getElementById('cotizacion-detail');



  initCotizacionDetail({

    detailContainer,

    listContainer: container,

  });



  setPdfListRefreshHandler(() => {

    if (!isDetailOpen() && lastItems.length > 0) {

      renderCards(lastItems);

    }

  });



  onPdfCacheStatus(() => {

    if (!isDetailOpen() && lastItems.length > 0) {

      renderCards(lastItems);

    }

  });

  bindListActions();

}



export function closeCotizacionesDetail() {

  closeCotizacionDetail();

}


