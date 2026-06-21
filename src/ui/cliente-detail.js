import { getMaquinasCompradas } from '../services/clientes.js';
import { getEstadoLabel } from '../services/solicitudes-stats.js';
import { mapSolicitudToCard, parsePricing } from '../services/cotizaciones.js';
import { formatQuoteMoney } from './quote-pdf-template.js';
import { renderBackButton } from './action-buttons.js';
import { escapeHtml, formatShortDate } from './view-utils.js';
import { initAppModal, openAppModal, closeAppModal, isAppModalOpen } from './app-modal.js';

/** @type {(() => void) | null} */
let onBackCallback = null;

export function initClienteDetail() {
  initAppModal();
}

/**
 * @param {import('../services/clientes.js').ClienteProfile} profile
 * @param {Array<{ nombre: string; cantidad: string | null; solicitudId: string }>} machines
 * @returns {string}
 */
function renderClienteDetailHtml(profile, machines) {
  const timelineHtml =
    profile.items.length === 0
      ? '<p class="quote-detail__empty">Sin solicitudes registradas</p>'
      : `<div class="timeline">${profile.items
          .map((item) => {
            const card = mapSolicitudToCard(item);
            const pricing = parsePricing(item);
            return `
              <article class="timeline__item">
                <div class="timeline__head">
                  <strong>${escapeHtml(getEstadoLabel(item))}</strong>
                  <span>${formatShortDate(item.createdAt ?? item.fecha ?? item.creadoEn)}</span>
                </div>
                <p>${escapeHtml(String(card.producto ?? '—'))}</p>
                ${
                  pricing.precioTotal != null
                    ? `<p class="timeline__price">$ ${formatQuoteMoney(pricing.precioTotal)}</p>`
                    : ''
                }
              </article>`;
          })
          .join('')}</div>`;

  return `
    <div class="quote-detail">
      <div class="quote-detail__toolbar">
        ${renderBackButton()}
        <h2 class="quote-detail__heading" id="app-detail-modal-title">${escapeHtml(profile.cliente)}</h2>
      </div>

      <section class="quote-section">
        <h3 class="quote-section__title">Contacto</h3>
        <dl class="quote-fields">
          <div class="quote-fields__row"><dt>Email</dt><dd>${escapeHtml(profile.email ?? '—')}</dd></div>
          <div class="quote-fields__row"><dt>Teléfono</dt><dd>${escapeHtml(profile.telefono ?? '—')}</dd></div>
          <div class="quote-fields__row"><dt>Solicitudes</dt><dd>${profile.solicitudesCount}</dd></div>
          <div class="quote-fields__row"><dt>OT completadas</dt><dd>${profile.otCompletadas}</dd></div>
        </dl>
      </section>

      <section class="quote-section">
        <h3 class="quote-section__title">Historial de solicitudes</h3>
        ${timelineHtml}
      </section>

      <section class="quote-section">
        <h3 class="quote-section__title">Máquinas compradas</h3>
        ${
          machines.length === 0
            ? '<p class="quote-detail__empty">Sin compras completadas</p>'
            : `<ul class="machine-list">${machines
                .map(
                  (machine) =>
                    `<li>${escapeHtml(machine.nombre)}${machine.cantidad ? ` × ${escapeHtml(machine.cantidad)}` : ''}</li>`
                )
                .join('')}</ul>`
        }
      </section>
    </div>`;
}

/**
 * @param {import('../services/clientes.js').ClienteProfile} profile
 * @param {{ onBack?: () => void }} [callbacks]
 */
export function openClienteDetail(profile, callbacks = {}) {
  initAppModal();
  onBackCallback = callbacks.onBack ?? null;

  let html;
  try {
    const machines = getMaquinasCompradas(profile);
    html = renderClienteDetailHtml(profile, machines);
  } catch (error) {
    console.error('[cliente-detail]', error);
    html = `
      <div class="quote-detail">
        <div class="quote-detail__toolbar">${renderBackButton()}</div>
        <p class="error-banner">No se pudo cargar el detalle del cliente.</p>
      </div>`;
  }

  const body = openAppModal({
    onClose: () => {
      onBackCallback?.();
      onBackCallback = null;
    },
  });

  body.innerHTML = html;

  body.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    closeClienteDetail();
  });
}

export function closeClienteDetail() {
  if (!isAppModalOpen()) return;
  closeAppModal();
}

export function isClienteDetailOpen() {
  return isAppModalOpen();
}
