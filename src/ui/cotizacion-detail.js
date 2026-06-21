import { mapSolicitudToDetail, hasPricingReady, parsePricing, marcarPdfRevisado, deleteSolicitud } from '../services/cotizaciones.js';
import { formatFirestoreError } from '../firebase/errors.js';
import { formatQuoteMoney, formatEnvioDisplay } from './quote-pdf-template.js';
import { openQuotePdfPreview, getOrderPdfStatus } from '../services/quote-pdf-auto.js';
import { confirmDialog } from './app-alerts.js';
import { renderActionBar, renderActionButton, renderBackButton, ActionIcons } from './action-buttons.js';
import { openCotizacionEditModal } from './cotizacion-edit.js';

/** @type {HTMLElement | null} */
let detailRoot = null;

/** @type {HTMLElement | null} */
let listRoot = null;

/** @type {(() => void) | null} */
let onBackCallback = null;

/** @type {(() => void) | null} */
let onDeletedCallback = null;

/** @type {HTMLElement | null} */
let activeContainer = null;

/** @type {boolean} */
let readOnlyMode = false;

/** @type {boolean} */
let allowDeleteMode = false;

/**
 * @param {{ detailContainer: HTMLElement | null; listContainer: HTMLElement | null }} refs
 */
export function initCotizacionDetail(refs) {
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
    return '<p class="quote-detail__empty">Sin maquinaria seleccionada</p>';
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
      <td>${p.precioUnitario != null ? `$ ${formatQuoteMoney(p.precioUnitario)}` : '—'}</td>
      <td>${p.precioTotal != null ? `$ ${formatQuoteMoney(p.precioTotal)}` : '—'}</td>
    </tr>
    ${p.descripcion ? `<tr class="quote-products__desc-row"><td colspan="7">${escapeHtml(p.descripcion)}</td></tr>` : ''}`
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
          <th>P. unit.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @returns {string}
 */
function renderPricingSection(rawItem) {
  const detail = mapSolicitudToDetail(rawItem);
  const pricing = parsePricing(rawItem);

  if (!hasPricingReady(rawItem)) {
    return `
      <section class="quote-section quote-section--pricing">
        <h3 class="quote-section__title">Precios</h3>
        <p class="quote-detail__empty">Los precios se cargan desde la web y el PDF se genera automáticamente al llegar.</p>
      </section>`;
  }

  return `
    <section class="quote-section quote-section--pricing">
      <h3 class="quote-section__title">Precios (desde la web)</h3>
      <div class="quote-totals-summary">
        <div class="quote-totals-summary__row">
          <span>Precio maquinaria</span>
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
    </section>`;
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @returns {string}
 */
function renderDetailHtml(rawItem, readOnly = false, allowDelete = false) {
  const detail = mapSolicitudToDetail(rawItem);
  const pdfStatus = getOrderPdfStatus(rawItem);
  const canViewPdf = hasPricingReady(rawItem);

  let pdfStatusLabel = 'Pendiente';
  if (pdfStatus === 'ready') pdfStatusLabel = 'PDF listo para revisar';
  if (pdfStatus === 'generating') pdfStatusLabel = 'Generando PDF…';
  if (pdfStatus === 'pending-prices') pdfStatusLabel = 'Esperando precios desde la web';

  return `
    <div class="quote-detail">
      <div class="quote-detail__toolbar">
        ${renderBackButton()}
        <h2 class="quote-detail__heading">Cotización — ${escapeHtml(String(detail.cliente))}</h2>
      </div>

      <div class="quote-detail__error" id="quote-detail-error" hidden></div>

      <div class="quote-printable">
        <div class="quote-printable__header">
          <div class="quote-printable__brand">FICA TOSTADORES</div>
          <div class="quote-printable__doc-title">Solicitud de cotización</div>
          <div class="quote-printable__date">${formatDate(detail.createdAt)} · ${escapeHtml(pdfStatusLabel)}</div>
        </div>

        <section class="quote-section">
          <h3 class="quote-section__title">Datos del cliente (solicitud web)</h3>
          <dl class="quote-fields">
            <div class="quote-fields__row"><dt>Nombre</dt><dd>${escapeHtml(String(detail.cliente))}</dd></div>
            ${detail.empresa ? `<div class="quote-fields__row"><dt>Empresa</dt><dd>${escapeHtml(detail.empresa)}</dd></div>` : ''}
            <div class="quote-fields__row"><dt>Email</dt><dd>${escapeHtml(String(detail.email ?? '—'))}</dd></div>
            <div class="quote-fields__row"><dt>Teléfono</dt><dd>${escapeHtml(String(detail.telefono ?? '—'))}</dd></div>
            ${detail.direccion ? `<div class="quote-fields__row"><dt>Dirección envío</dt><dd>${escapeHtml(detail.direccion)}</dd></div>` : ''}
            ${detail.ciudad ? `<div class="quote-fields__row"><dt>Ciudad</dt><dd>${escapeHtml(detail.ciudad)}</dd></div>` : ''}
            ${detail.region ? `<div class="quote-fields__row"><dt>Región</dt><dd>${escapeHtml(detail.region)}</dd></div>` : ''}
            ${detail.zipDestino ? `<div class="quote-fields__row"><dt>Código postal</dt><dd>${escapeHtml(detail.zipDestino)}</dd></div>` : ''}
            ${detail.pais ? `<div class="quote-fields__row"><dt>País</dt><dd>${escapeHtml(detail.pais)}</dd></div>` : ''}
            ${detail.clientUid ? `<div class="quote-fields__row"><dt>UID cliente</dt><dd>${escapeHtml(detail.clientUid)}</dd></div>` : ''}
            ${detail.notas ? `<div class="quote-fields__row"><dt>Mensaje</dt><dd>${escapeHtml(String(detail.notas))}</dd></div>` : ''}
          </dl>
        </section>

        <section class="quote-section">
          <h3 class="quote-section__title">Maquinaria solicitada</h3>
          ${renderProductsTable(detail)}
        </section>

        ${renderPricingSection(rawItem)}
      </div>

      ${renderActionBar(
        [
          renderActionButton({
            action: 'pdf',
            label: 'Ver PDF',
            icon: ActionIcons.pdf,
            variant: 'primary',
            disabled: !canViewPdf,
          }),
          ...(!readOnly
            ? [
                renderActionButton({
                  action: 'editar',
                  label: 'Editar',
                  icon: ActionIcons.edit,
                }),
                renderActionButton({
                  action: 'revisado',
                  label: 'Marcar revisada',
                  icon: ActionIcons.reviewed,
                  disabled: !canViewPdf,
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
  const errorEl = document.getElementById('quote-detail-error');
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
    closeCotizacionDetail();
    onBackCallback?.();
  });

  container.querySelector('[data-action="pdf"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    button.disabled = true;
    try {
      await openQuotePdfPreview(rawItem);
    } catch (error) {
      console.error('[cotizacion-detail]', error);
      showDetailError(error instanceof Error ? error.message : formatFirestoreError(error));
    } finally {
      button.disabled = false;
    }
  });

  if (!readOnlyMode) {
    container.querySelector('[data-action="editar"]')?.addEventListener('click', () => {
      openCotizacionEditModal(rawItem, {
        onSaved: (updated) => {
          Object.assign(rawItem, updated);
          container.innerHTML = renderDetailHtml(rawItem, readOnlyMode, allowDeleteMode);
          bindDetailActions(rawItem);
        },
      });
    });

    container.querySelector('[data-action="revisado"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    const detail = mapSolicitudToDetail(rawItem);
    const confirmed = await confirmDialog({
      title: 'Marcar como revisada',
      message: `¿Marcar la cotización de ${detail.cliente} como revisada? Se registrará en el sistema.`,
      confirmLabel: 'Marcar revisada',
      cancelLabel: 'Cancelar',
      variant: 'primary',
    });
    if (!confirmed) return;

    button.disabled = true;
    try {
      await marcarPdfRevisado(rawItem.id);
      closeCotizacionDetail();
      onBackCallback?.();
    } catch (error) {
      console.error('[cotizacion-detail]', error);
      showDetailError(error instanceof Error ? error.message : formatFirestoreError(error));
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
      title: 'Eliminar cotización',
      message: `¿Eliminar la cotización de ${detail.cliente}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!confirmed) return;

    button.disabled = true;
    try {
      await deleteSolicitud(rawItem.id);
      closeCotizacionDetail();
      onDeletedCallback?.();
      onBackCallback?.();
    } catch (error) {
      console.error('[cotizacion-detail]', error);
      showDetailError(formatFirestoreError(error));
    } finally {
      button.disabled = false;
    }
  });
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @param {{ onBack?: () => void; onDeleted?: () => void; readOnly?: boolean; allowDelete?: boolean; detailContainer?: HTMLElement }} callbacks
 */
export function openCotizacionDetail(rawItem, callbacks = {}) {
  const container = callbacks.detailContainer ?? detailRoot;
  if (!container) return;

  readOnlyMode = Boolean(callbacks.readOnly);
  allowDeleteMode = Boolean(callbacks.allowDelete);
  activeContainer = container;
  onBackCallback = callbacks.onBack ?? null;
  onDeletedCallback = callbacks.onDeleted ?? null;
  container.innerHTML = renderDetailHtml(rawItem, readOnlyMode, allowDeleteMode);
  container.hidden = false;

  if (container === detailRoot && listRoot) {
    listRoot.hidden = true;
  }

  bindDetailActions(rawItem);
}

export function closeCotizacionDetail() {
  const container = activeContainer ?? detailRoot;
  if (container) {
    container.hidden = true;
    container.innerHTML = '';
  }
  if (listRoot && container === detailRoot) {
    listRoot.hidden = false;
  }
  activeContainer = null;
  readOnlyMode = false;
  allowDeleteMode = false;
  onBackCallback = null;
  onDeletedCallback = null;
}

export function isDetailOpen() {
  const container = activeContainer ?? detailRoot;
  return container != null && !container.hidden;
}
