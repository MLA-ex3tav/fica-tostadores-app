import { subscribeAllSolicitudes, filterHistorial, getEstadoLabel, ESTADOS_HISTORIAL } from '../services/solicitudes-stats.js';
import { mapSolicitudToCard, parsePricing, deleteSolicitud } from '../services/cotizaciones.js';
import { formatFirestoreError } from '../firebase/errors.js';
import { formatQuoteMoney } from './quote-pdf-template.js';
import { openCotizacionDetail, closeCotizacionDetail, isDetailOpen } from './cotizacion-detail.js';
import { openOTDetail, closeOTDetail, isOTDetailOpen } from './ot-detail.js';
import { openAppModal, closeAppModal } from './app-modal.js';
import { confirmDialog, showToast } from './app-alerts.js';
import { renderActionBar, renderActionButton, ActionIcons } from './action-buttons.js';
import { escapeHtml, formatShortDate } from './view-utils.js';
import { renderLucideIcon, StateIcons } from './lucide-icons.js';

/** @type {HTMLElement | null} */
let listRoot = null;

/** @type {(() => void) | null} */
let unsubscribeAll = null;

/** @type {Array<{ id: string } & Record<string, unknown>>} */
let lastItems = [];

/** @type {string} */
let filterEstado = 'all';

/** @type {string} */
let filterQuery = '';

const DELETE_SUCCESS_MESSAGE =
  'Registro eliminado localmente. Se sincronizará con Firebase automáticamente.';

function getHistorialItems() {
  return lastItems.filter((item) => ESTADOS_HISTORIAL.has(String(item.estado ?? '')));
}

function renderFilters() {
  const options = [
    ['all', 'Todos'],
    ['en_cotizacion', 'En cotización'],
    ['completada', 'Completadas'],
    ['rechazada', 'Rechazadas'],
  ];

  const historialCount = getHistorialItems().length;

  return `
    <div class="filters-bar">
      <input class="filters-bar__search" type="search" placeholder="Buscar cliente…" value="${escapeHtml(filterQuery)}" data-filter="query" />
      <select class="filters-bar__select" data-filter="estado">
        ${options
          .map(
            ([value, label]) =>
              `<option value="${value}"${filterEstado === value ? ' selected' : ''}>${label}</option>`
          )
          .join('')}
      </select>
      ${
        historialCount > 0
          ? `<button type="button" class="btn btn--danger btn--sm" data-action="vaciar">Vaciar historial (${historialCount})</button>`
          : ''
      }
    </div>`;
}

/**
 * @param {{ id: string } & Record<string, unknown>} item
 */
function renderRow(item) {
  const card = mapSolicitudToCard(item);
  const pricing = parsePricing(item);
  const estadoLabel = getEstadoLabel(item);

  return `
    <article class="hist-row hist-row--clickable" data-id="${escapeHtml(item.id)}" role="button" tabindex="0">
      <div class="hist-row__main">
        <div class="hist-row__header">
          <h3 class="hist-row__title">${escapeHtml(String(card.cliente ?? 'Sin cliente'))}</h3>
          <span class="status-badge status-badge--${escapeHtml(String(item.estado ?? 'pendiente'))}">${escapeHtml(estadoLabel)}</span>
        </div>
        <p class="hist-row__meta">${escapeHtml(String(card.producto ?? '—'))} · ${formatShortDate(item.createdAt)}</p>
        ${pricing.precioTotal != null ? `<p class="hist-row__price">$ ${formatQuoteMoney(pricing.precioTotal)}</p>` : ''}
      </div>
      ${renderActionBar(
        [
          renderActionButton({
            action: 'eliminar',
            id: item.id,
            label: 'Eliminar',
            icon: ActionIcons.delete,
            variant: 'danger',
          }),
        ].join(''),
        'hist-row__actions'
      )}
    </article>`;
}

function getFilteredItems() {
  const estados = filterEstado === 'all' ? [...ESTADOS_HISTORIAL] : [filterEstado];
  return filterHistorial(lastItems, { estados, query: filterQuery });
}

/**
 * @param {{ id: string } & Record<string, unknown>} item
 */
async function confirmAndDeleteItem(item) {
  const card = mapSolicitudToCard(item);
  const cliente = card.cliente ?? 'este registro';
  const confirmed = await confirmDialog({
    title: 'Eliminar del historial',
    message: `¿Eliminar el registro de ${cliente}? Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
    variant: 'danger',
  });
  if (!confirmed) return false;

  await deleteSolicitud(item.id);
  showToast({ message: DELETE_SUCCESS_MESSAGE, variant: 'success' });
  return true;
}

function openDetailById(id) {
  const item = lastItems.find((entry) => entry.id === id);
  if (!item) return;

  closeCotizacionDetail();
  closeOTDetail();

  const body = openAppModal({
    onClose: () => {
      closeCotizacionDetail();
      closeOTDetail();
    },
  });

  const callbacks = {
    readOnly: true,
    allowDelete: true,
    detailContainer: body,
    onBack: () => closeAppModal(),
    onDeleted: () => {
      showToast({ message: DELETE_SUCCESS_MESSAGE, variant: 'success' });
      closeAppModal();
    },
  };

  if (item.estado === 'aprobada_ot' || item.estado === 'completada') {
    void openOTDetail(item, callbacks);
    return;
  }

  openCotizacionDetail(item, callbacks);
}

async function vaciarHistorial() {
  const items = getHistorialItems();
  if (items.length === 0) return;

  const confirmed = await confirmDialog({
    title: 'Vaciar historial',
    message: `¿Eliminar los ${items.length} registros del historial? Esta acción no se puede deshacer.`,
    confirmLabel: 'Vaciar historial',
    cancelLabel: 'Cancelar',
    variant: 'danger',
  });
  if (!confirmed) return;

  const vaciarButton = listRoot?.querySelector('[data-action="vaciar"]');
  if (vaciarButton instanceof HTMLButtonElement) {
    vaciarButton.disabled = true;
  }

  try {
    for (const item of items) {
      await deleteSolicitud(item.id);
    }
    showToast({
      message: `Historial vaciado (${items.length} registros). Se sincronizará con Firebase automáticamente.`,
      variant: 'success',
      duration: 6000,
    });
  } catch (error) {
    console.error('[historial]', error);
    showToast({
      message: error instanceof Error ? error.message : formatFirestoreError(error),
      variant: 'error',
      duration: 6000,
    });
  } finally {
    if (vaciarButton instanceof HTMLButtonElement) {
      vaciarButton.disabled = false;
    }
  }
}

function bindListActions() {
  if (!listRoot || listRoot.dataset.bound === 'true') return;

  listRoot.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest('[data-action]');
    if (button instanceof HTMLButtonElement && button.dataset.id) {
      event.preventDefault();
      event.stopPropagation();

      const action = button.dataset.action;
      const id = button.dataset.id;
      const item = lastItems.find((entry) => entry.id === id);
      if (!item || action !== 'eliminar') return;

      button.disabled = true;
      try {
        await confirmAndDeleteItem(item);
      } catch (error) {
        console.error('[historial]', error);
        showToast({
          message: error instanceof Error ? error.message : formatFirestoreError(error),
          variant: 'error',
        });
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (button instanceof HTMLButtonElement && button.dataset.action === 'vaciar') {
      event.preventDefault();
      await vaciarHistorial();
    }
  });

  listRoot.dataset.bound = 'true';
}

function renderList() {
  if (!listRoot) return;

  const items = getFilteredItems();

  listRoot.innerHTML = `
    ${renderFilters()}
    <div class="hist-list">
      ${
        items.length === 0
          ? `<div class="empty-state">${renderLucideIcon(StateIcons.emptyInbox, { width: 48, height: 48 })}<p>Sin registros en el historial</p></div>`
          : items.map(renderRow).join('')
      }
    </div>
  `;

  listRoot.querySelector('[data-filter="query"]')?.addEventListener('input', (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    filterQuery = target.value;
    renderList();
  });

  listRoot.querySelector('[data-filter="estado"]')?.addEventListener('change', (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    filterEstado = target.value;
    renderList();
  });

  listRoot.querySelectorAll('.hist-row--clickable').forEach((row) => {
    row.addEventListener('click', () => {
      if (row instanceof HTMLElement && row.dataset.id) openDetailById(row.dataset.id);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (row instanceof HTMLElement && row.dataset.id) openDetailById(row.dataset.id);
    });
  });
}

export function initHistorialView() {
  listRoot = document.getElementById('historial-list');
  bindListActions();
}

export function startHistorialListener() {
  if (unsubscribeAll) return;

  unsubscribeAll = subscribeAllSolicitudes(
    (items) => {
      lastItems = items;
      if (!isDetailOpen() && !isOTDetailOpen()) {
        renderList();
      }
    },
    (error) => {
      console.error('[historial]', error);
      if (listRoot) {
        listRoot.innerHTML = `<div class="error-banner">${escapeHtml(error.message)}</div>`;
      }
    }
  );
}

export function stopHistorialListener() {
  if (unsubscribeAll) {
    unsubscribeAll();
    unsubscribeAll = null;
  }
}

export function closeHistorialDetail() {
  closeCotizacionDetail();
  closeOTDetail();
  closeAppModal();
}
