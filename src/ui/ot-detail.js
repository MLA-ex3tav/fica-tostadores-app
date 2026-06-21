import {
  mapSolicitudToDetail,
  parsePricing,
  hasPricingReady,
  finalizarOrdenTrabajo,
  deleteSolicitud,
} from '../services/cotizaciones.js';
import { formatFirestoreError } from '../firebase/errors.js';
import { formatQuoteMoney, formatEnvioDisplay } from './quote-pdf-template.js';
import { openQuotePdfPreview, printQuotePdf } from '../services/quote-pdf-auto.js';
import { confirmDialog, showToast } from './app-alerts.js';
import { renderActionBar, renderActionButton, renderBackButton, ActionIcons } from './action-buttons.js';

/** @type {HTMLElement | null} */
let detailRoot = null;

/** @type {HTMLElement | null} */
let listRoot = null;

/** @type {(() => void) | null} */
let onBackCallback = null;

/** @type {(() => void) | null} */
let onFinalizedCallback = null;

/** @type {(() => void) | null} */
let onDeletedCallback = null;

/** @type {HTMLElement | null} */
let activeContainer = null;

/** @type {boolean} */
let readOnlyMode = false;

/** @type {boolean} */
let allowDeleteMode = false;

function resolveOTRefs() {
  if (!detailRoot) {
    detailRoot = document.getElementById('ot-detail');
  }
  if (!listRoot) {
    listRoot = document.getElementById('ot-list');
  }
  return detailRoot != null && listRoot != null;
}

/**
 * @param {{ detailContainer: HTMLElement | null; listContainer: HTMLElement | null }} refs
 */
export function initOTDetail(refs) {
  detailRoot = refs.detailContainer;
  listRoot = refs.listContainer;
}

/**
 * @param {import('firebase/firestore').Timestamp | Date | string | undefined} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) return '—';

  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'long',
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
 * @param {ReturnType<typeof mapSolicitudToDetail>} detail
 * @returns {string}
 */
function renderProductsTable(detail) {
  if (detail.productos.length === 0) {
    return '<p class="quote-detail__empty">Sin maquinaria registrada</p>';
  }

  const rows = detail.productos
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.codigo ?? p.modelo ?? '—')}</td>
      <td>${escapeHtml(p.nombre)}</td>
      <td>${escapeHtml(p.modelo ?? '—')}</td>
      <td>${escapeHtml(p.capacidad ?? '—')}</td>
      <td>${escapeHtml(p.cantidad ?? '—')}</td>
      <td>${p.precioTotal != null ? `$ ${formatQuoteMoney(p.precioTotal)}` : '—'}</td>
    </tr>`
    )
    .join('');

  return `
    <table class="quote-products__table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Producto</th>
          <th>Modelo</th>
          <th>Capacidad</th>
          <th>Cant.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @param {boolean} readOnly
 * @returns {string}
 */
function renderDetailHtml(rawItem, readOnly, allowDelete) {
  const detail = mapSolicitudToDetail(rawItem);
  const pricing = parsePricing(rawItem);
  const canViewPdf = hasPricingReady(rawItem);
  const aprobadaAt = rawItem.aprobadaAt ?? rawItem.createdAt;

  return `
    <div class="quote-detail">
      <div class="quote-detail__toolbar">
        ${renderBackButton()}
        <h2 class="quote-detail__heading">Orden de trabajo — ${escapeHtml(String(detail.cliente))}</h2>
      </div>

      <div class="quote-detail__error" id="ot-detail-error" hidden></div>

      <div class="quote-printable">
        <div class="quote-printable__header">
          <div class="quote-printable__brand">FICA TOSTADORES</div>
          <div class="quote-printable__doc-title">Orden de trabajo</div>
          <div class="quote-printable__date">Aprobada ${formatDate(aprobadaAt)} · En producción</div>
        </div>

        <section class="quote-section">
          <h3 class="quote-section__title">Cliente</h3>
          <dl class="quote-fields">
            <div class="quote-fields__row"><dt>Nombre</dt><dd>${escapeHtml(String(detail.cliente))}</dd></div>
            <div class="quote-fields__row"><dt>Email</dt><dd>${escapeHtml(String(detail.email ?? '—'))}</dd></div>
            <div class="quote-fields__row"><dt>Teléfono</dt><dd>${escapeHtml(String(detail.telefono ?? '—'))}</dd></div>
            ${detail.direccion ? `<div class="quote-fields__row"><dt>Dirección envío</dt><dd>${escapeHtml(detail.direccion)}</dd></div>` : ''}
            ${detail.ciudad ? `<div class="quote-fields__row"><dt>Ciudad</dt><dd>${escapeHtml(detail.ciudad)}</dd></div>` : ''}
            ${detail.region ? `<div class="quote-fields__row"><dt>Región</dt><dd>${escapeHtml(detail.region)}</dd></div>` : ''}
            ${detail.notas ? `<div class="quote-fields__row"><dt>Notas</dt><dd>${escapeHtml(String(detail.notas))}</dd></div>` : ''}
          </dl>
        </section>

        <section class="quote-section">
          <h3 class="quote-section__title">Maquinaria a fabricar</h3>
          ${renderProductsTable(detail)}
        </section>

        <section class="quote-section quote-section--pricing">
          <h3 class="quote-section__title">Totales de la cotización</h3>
          <div class="quote-totals-summary">
            <div class="quote-totals-summary__row">
              <span>Maquinaria</span>
              <strong>$ ${formatQuoteMoney(pricing.precioFinal ?? 0)}</strong>
            </div>
            <div class="quote-totals-summary__row">
              <span>Envío</span>
              <strong>${formatEnvioDisplay(pricing.envio)}</strong>
            </div>
            <div class="quote-totals-summary__row quote-totals-summary__row--total">
              <span>Total</span>
              <strong>$ ${formatQuoteMoney(pricing.precioTotal ?? 0)}</strong>
            </div>
          </div>
        </section>
      </div>

      ${renderActionBar(
        [
          renderActionButton({
            action: 'pdf',
            label: 'Ver PDF',
            icon: ActionIcons.pdf,
            disabled: !canViewPdf,
          }),
          ...(!readOnly
            ? [
                renderActionButton({
                  action: 'finalizar',
                  label: 'Finalizar',
                  icon: ActionIcons.finalize,
                  variant: 'primary',
                }),
              ]
            : []),
          ...(!readOnly || allowDelete
            ? [
                renderActionButton({
                  action: 'eliminar',
                  label: 'Eliminar',
                  icon: ActionIcons.delete,
                  variant: 'danger',
                }),
              ]
            : []),
        ].join(''),
        'quote-detail__actions'
      )}
    </div>
  `;
}

/**
 * @param {string} message
 */
function showDetailError(message) {
  const errorEl = document.getElementById('ot-detail-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 */
function bindDetailActions(rawItem) {
  const container = activeContainer ?? detailRoot;
  if (!container) return;

  container.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    closeOTDetail();
    onBackCallback?.();
  });

  container.querySelector('[data-action="pdf"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    button.disabled = true;
    try {
      await openQuotePdfPreview(rawItem);
    } catch (error) {
      console.error('[ot-detail]', error);
      showDetailError(error instanceof Error ? error.message : formatFirestoreError(error));
    } finally {
      button.disabled = false;
    }
  });

  if (!readOnlyMode) {
    container.querySelector('[data-action="finalizar"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    const confirmed = await confirmDialog({
      title: 'Finalizar orden de trabajo',
      message:
        '¿Finalizar esta orden de trabajo? Se marcará como completada y se abrirá el diálogo de impresión del PDF.',
      confirmLabel: 'Finalizar',
      cancelLabel: 'Cancelar',
      variant: 'warning',
    });
    if (!confirmed) return;

    button.disabled = true;
    try {
      await finalizarOrdenTrabajo(rawItem.id);
      try {
        await printQuotePdf(rawItem);
      } catch (printError) {
        console.error('[ot-detail]', printError);
        showToast({
          message:
            printError instanceof Error
              ? printError.message
              : 'La OT se finalizó, pero no se pudo imprimir el PDF.',
          variant: 'warning',
          duration: 6000,
        });
      }
      closeOTDetail();
      onFinalizedCallback?.();
      onBackCallback?.();
    } catch (error) {
      console.error('[ot-detail]', error);
      showDetailError(formatFirestoreError(error));
    } finally {
      button.disabled = false;
    }
    });
  }

  if (readOnlyMode && !allowDeleteMode) return;

  container.querySelector('[data-action="eliminar"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    const detail = mapSolicitudToDetail(rawItem);
    const confirmed = await confirmDialog({
      title: 'Eliminar orden de trabajo',
      message: `¿Eliminar la orden de trabajo de ${detail.cliente}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!confirmed) return;

    button.disabled = true;
    try {
      await deleteSolicitud(rawItem.id);
      closeOTDetail();
      onDeletedCallback?.();
      onBackCallback?.();
    } catch (error) {
      console.error('[ot-detail]', error);
      showDetailError(formatFirestoreError(error));
    } finally {
      button.disabled = false;
    }
  });
}

function setOTDetailMode(active) {
  const view = document.getElementById('view-ot');
  const content = document.querySelector('.content');
  if (view) {
    view.classList.toggle('view-ot--detail', active);
  }
  if (active && content) {
    content.scrollTo({ top: 0, behavior: 'auto' });
  }
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @param {{ onBack?: () => void; onFinalized?: () => void; onDeleted?: () => void; readOnly?: boolean; allowDelete?: boolean; detailContainer?: HTMLElement }} callbacks
 */
export async function openOTDetail(rawItem, callbacks = {}) {
  if (!resolveOTRefs() && !callbacks.detailContainer) {
    throw new Error('No se encontró el panel de detalle de OT.');
  }

  const container = callbacks.detailContainer ?? detailRoot;
  if (!container) {
    throw new Error('No se encontró el panel de detalle de OT.');
  }

  readOnlyMode = Boolean(callbacks.readOnly);
  allowDeleteMode = Boolean(callbacks.allowDelete);
  activeContainer = container;
  onBackCallback = callbacks.onBack ?? null;
  onFinalizedCallback = callbacks.onFinalized ?? null;
  onDeletedCallback = callbacks.onDeleted ?? null;

  container.innerHTML = renderDetailHtml(rawItem, readOnlyMode, allowDeleteMode);
  container.removeAttribute('hidden');

  if (container === detailRoot && listRoot) {
    listRoot.setAttribute('hidden', '');
  }

  setOTDetailMode(container === detailRoot);
  bindDetailActions(rawItem);
}

export function closeOTDetail() {
  resolveOTRefs();

  const container = activeContainer ?? detailRoot;
  if (container) {
    container.setAttribute('hidden', '');
    container.innerHTML = '';
  }
  if (listRoot && container === detailRoot) {
    listRoot.removeAttribute('hidden');
  }
  if (container === detailRoot) {
    setOTDetailMode(false);
  }
  activeContainer = null;
  readOnlyMode = false;
  allowDeleteMode = false;
  onBackCallback = null;
  onFinalizedCallback = null;
  onDeletedCallback = null;
}

export function isOTDetailOpen() {
  const container = activeContainer ?? detailRoot;
  return container != null && !container.hasAttribute('hidden');
}
