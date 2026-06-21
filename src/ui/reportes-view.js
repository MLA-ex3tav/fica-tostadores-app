import {
  subscribeAllSolicitudes,
  countAprobacionesRechazos,
  ingresosPorMes,
  topProductos,
  sumIngresosPeriodo,
} from '../services/solicitudes-stats.js';
import { formatQuoteMoney } from './quote-pdf-template.js';
import { escapeHtml, resolvePeriodRange, downloadExcel } from './view-utils.js';

/** @type {HTMLElement | null} */
let root = null;

/** @type {(() => void) | null} */
let unsubscribeAll = null;

/** @type {Array<{ id: string } & Record<string, unknown>>} */
let lastItems = [];

/** @type {'month' | 'quarter' | 'year' | 'all'} */
let selectedPeriod = 'month';

function filterItemsByRange(items, range) {
  return items.filter((item) => {
    const ms = Date.parse(String(item.createdAt ?? ''));
    if (Number.isNaN(ms)) return selectedPeriod === 'all';
    return ms >= range.start && ms <= range.end;
  });
}

function renderReportes() {
  if (!root) return;

  const range = resolvePeriodRange(selectedPeriod);
  const counts = countAprobacionesRechazos(lastItems, range);
  const ingresos = sumIngresosPeriodo(lastItems, range);
  const monthly = ingresosPorMes(lastItems, range);
  const products = topProductos(filterItemsByRange(lastItems, range), 8);

  root.innerHTML = `
    <div class="reportes-layout">
    <div class="filters-bar">
      <select class="filters-bar__select" data-filter="period">
        <option value="month"${selectedPeriod === 'month' ? ' selected' : ''}>Mes actual</option>
        <option value="quarter"${selectedPeriod === 'quarter' ? ' selected' : ''}>Trimestre actual</option>
        <option value="year"${selectedPeriod === 'year' ? ' selected' : ''}>Año actual</option>
        <option value="all"${selectedPeriod === 'all' ? ' selected' : ''}>Todo</option>
      </select>
      <button class="btn btn--secondary" type="button" data-action="export">Exportar Excel</button>
    </div>

    <div class="report-grid">
      <article class="panel-card report-card">
        <h2 class="panel-card__title">Aprobadas vs rechazadas</h2>
        <dl class="report-stats">
          <div><dt>Aprobadas / completadas</dt><dd>${counts.aprobadas}</dd></div>
          <div><dt>Rechazadas</dt><dd>${counts.rechazadas}</dd></div>
          <div><dt>Completadas</dt><dd>${counts.completadas}</dd></div>
        </dl>
      </article>
      <article class="panel-card report-card">
        <h2 class="panel-card__title">Ingresos del período (CLP)</h2>
        <p class="report-total">$ ${formatQuoteMoney(ingresos)}</p>
      </article>
    </div>

    <div class="dashboard-panels report-panels">
      <section class="panel-card report-card">
        <h2 class="panel-card__title">Ingresos por mes</h2>
        ${
          monthly.length === 0
            ? '<p class="dashboard-empty">Sin ingresos en el período</p>'
            : `<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Mes</th><th>Total (CLP)</th></tr></thead><tbody>${monthly
                .map(
                  (row) =>
                    `<tr><td>${escapeHtml(row.month)}</td><td>$ ${formatQuoteMoney(row.total)}</td></tr>`
                )
                .join('')}</tbody></table></div>`
        }
      </section>
      <section class="panel-card report-card">
        <h2 class="panel-card__title">Productos más solicitados</h2>
        ${
          products.length === 0
            ? '<p class="dashboard-empty">Sin productos en el período</p>'
            : `<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Producto</th><th>Solicitudes</th></tr></thead><tbody>${products
                .map(
                  (row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.count}</td></tr>`
                )
                .join('')}</tbody></table></div>`
        }
      </section>
    </div>
    </div>
  `;

  root.querySelector('[data-filter="period"]')?.addEventListener('change', (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    selectedPeriod = /** @type {typeof selectedPeriod} */ (target.value);
    renderReportes();
  });

  root.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    const range = resolvePeriodRange(selectedPeriod);
    const counts = countAprobacionesRechazos(lastItems, range);
    const ingresos = sumIngresosPeriodo(lastItems, range);
    const monthly = ingresosPorMes(lastItems, range);
    const products = topProductos(filterItemsByRange(lastItems, range), 50);

    downloadExcel(
      [
        {
          name: 'Resumen',
          headers: ['Métrica', 'Valor'],
          rows: [
            ['Período', range.label],
            ['Aprobadas / completadas', counts.aprobadas],
            ['Rechazadas', counts.rechazadas],
            ['Completadas', counts.completadas],
            ['Ingresos (CLP)', ingresos],
          ],
        },
        {
          name: 'Ingresos por mes',
          headers: ['Mes', 'Total (CLP)'],
          rows: monthly.map((row) => [row.month, row.total]),
        },
        {
          name: 'Productos',
          headers: ['Producto', 'Solicitudes'],
          rows: products.map((row) => [row.name, row.count]),
        },
      ],
      `reporte-fica-${selectedPeriod}.xlsx`
    );
  });
}

export function initReportesView() {
  root = document.getElementById('reportes-root');
}

export function startReportesListener() {
  if (unsubscribeAll) return;

  unsubscribeAll = subscribeAllSolicitudes(
    (items) => {
      lastItems = items;
      renderReportes();
    },
    (error) => {
      console.error('[reportes]', error);
      if (root) {
        root.innerHTML = `<div class="error-banner">${escapeHtml(error.message)}</div>`;
      }
    }
  );
}

export function stopReportesListener() {
  if (unsubscribeAll) {
    unsubscribeAll();
    unsubscribeAll = null;
  }
}
