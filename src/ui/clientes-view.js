import { subscribeAllSolicitudes } from '../services/solicitudes-stats.js';
import { buildClienteProfiles } from '../services/clientes.js';
import { escapeHtml, formatShortDate } from './view-utils.js';
import { renderLucideIcon, StateIcons } from './lucide-icons.js';
import { openClienteDetail, closeClienteDetail, isClienteDetailOpen } from './cliente-detail.js';

/** @type {HTMLElement | null} */
let listRoot = null;

/** @type {(() => void) | null} */
let unsubscribeAll = null;

/** @type {import('../services/clientes.js').ClienteProfile[]} */
let lastProfiles = [];

/** @type {string} */
let filterQuery = '';

function renderList() {
  if (!listRoot) return;

  const query = filterQuery.trim().toLowerCase();
  const profiles = query
    ? lastProfiles.filter((profile) => {
        const haystack = [profile.cliente, profile.email, profile.telefono].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      })
    : lastProfiles;

  listRoot.innerHTML = `
    <div class="filters-bar">
      <input class="filters-bar__search" type="search" placeholder="Buscar cliente…" value="${escapeHtml(filterQuery)}" data-filter="query" />
    </div>
    <div class="clientes-list">
      ${
        profiles.length === 0
          ? `<div class="empty-state">${renderLucideIcon(StateIcons.emptyInbox, { width: 48, height: 48 })}<p>Sin clientes registrados</p></div>`
          : profiles.map(renderRow).join('')
      }
    </div>
  `;

  listRoot.querySelector('[data-filter="query"]')?.addEventListener('input', (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    filterQuery = target.value;
    renderList();
  });

  listRoot.querySelectorAll('.cliente-row--clickable').forEach((row) => {
    row.addEventListener('click', () => {
      if (row instanceof HTMLElement && row.dataset.key) {
        const profile = lastProfiles.find((entry) => entry.key === row.dataset.key);
        if (profile) {
          openClienteDetail(profile, {
            onBack: () => closeClienteDetail(),
          });
        }
      }
    });
  });
}

/**
 * @param {import('../services/clientes.js').ClienteProfile} profile
 */
function renderRow(profile) {
  return `
    <article class="cliente-row cliente-row--clickable" data-key="${escapeHtml(profile.key)}" role="button" tabindex="0">
      <div class="cliente-row__main">
        <div class="cliente-row__header">
          <h3 class="cliente-row__title">${escapeHtml(profile.cliente)}</h3>
          ${profile.reincidente ? '<span class="cliente-row__badge">Recurrente</span>' : ''}
        </div>
        <p class="cliente-row__meta">${escapeHtml(profile.email ?? 'Sin email')}${profile.telefono ? ` · ${escapeHtml(profile.telefono)}` : ''}</p>
        <p class="cliente-row__meta">${profile.solicitudesCount} solicitud${profile.solicitudesCount === 1 ? '' : 'es'} · ${profile.otCompletadas} OT completada${profile.otCompletadas === 1 ? '' : 's'} · Última: ${formatShortDate(new Date(profile.ultimaActividadMs))}</p>
      </div>
    </article>`;
}

export function initClientesView() {
  listRoot = document.getElementById('clientes-list');
}

export function startClientesListener() {
  if (unsubscribeAll) return;

  unsubscribeAll = subscribeAllSolicitudes(
    (items) => {
      lastProfiles = buildClienteProfiles(items);
      if (!isClienteDetailOpen()) {
        renderList();
      }
    },
    (error) => {
      console.error('[clientes]', error);
      if (listRoot) {
        listRoot.innerHTML = `<div class="error-banner">${escapeHtml(error.message)}</div>`;
      }
    }
  );
}

export function stopClientesListener() {
  if (unsubscribeAll) {
    unsubscribeAll();
    unsubscribeAll = null;
  }
}

export function closeClientesDetail() {
  closeClienteDetail();
}
