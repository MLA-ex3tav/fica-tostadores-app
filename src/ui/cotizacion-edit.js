import {
  mapSolicitudToDetail,
  parsePricing,
  sumProductsSubtotal,
  updateCotizacionSolicitud,
} from '../services/cotizaciones.js';
import { listProductos } from '../services/productos.js';
import { formatProductCapacity } from '../services/productos-display.js';
import { formatQuoteMoney } from './quote-pdf-template.js';
import { formatFirestoreError } from '../firebase/errors.js';
import { openAppModal, closeAppModal } from './app-modal.js';
import { showToast } from './app-alerts.js';
import { escapeHtml } from './view-utils.js';

/** @typedef {import('../services/cotizaciones.js').ProductRow & { key: string }} EditProductLine */

/** @type {import('../services/productos.js').ProductoRecord[]} */
let catalogProductos = [];

/**
 * @param {import('../services/cotizaciones.js').ProductRow} product
 * @param {number} index
 * @returns {EditProductLine}
 */
function toEditLine(product, index) {
  const qty = Number(product.cantidad) || 1;
  return {
    key: `line-${index}-${product.codigo ?? product.nombre}`,
    nombre: product.nombre,
    codigo: product.codigo,
    modelo: product.modelo,
    capacidad: product.capacidad,
    cantidad: String(qty),
    descripcion: product.descripcion,
    precioUnitario: product.precioUnitario,
    precioTotal:
      product.precioTotal ??
      (product.precioUnitario != null ? product.precioUnitario * qty : null),
  };
}

/**
 * @param {ReturnType<typeof mapSolicitudToDetail>} detail
 * @returns {EditProductLine[]}
 */
function initialEditLines(detail) {
  if (detail.productos.length === 0) return [];
  return detail.productos.map((product, index) => toEditLine(product, index));
}

/**
 * @param {import('../services/productos.js').ProductoRecord} producto
 * @returns {EditProductLine}
 */
function lineFromCatalogProduct(producto) {
  const capacity = formatProductCapacity(producto);
  const unitPrice = producto.precioBase ?? null;
  return {
    key: `line-${Date.now()}-${producto.id}`,
    nombre: producto.nombre,
    codigo: producto.codigo ?? producto.id,
    modelo: producto.modelo,
    capacidad: capacity === '—' ? null : capacity,
    cantidad: '1',
    descripcion: null,
    precioUnitario: unitPrice,
    precioTotal: unitPrice,
  };
}

/**
 * @param {EditProductLine} line
 * @returns {import('../services/cotizaciones.js').ProductRow}
 */
function toProductRow(line) {
  const qty = Number(line.cantidad) || 1;
  const unit = line.precioUnitario ?? null;
  const total =
    line.precioTotal ?? (unit != null && Number.isFinite(unit) ? unit * qty : null);

  return {
    nombre: line.nombre,
    codigo: line.codigo,
    modelo: line.modelo,
    capacidad: line.capacidad,
    cantidad: String(qty),
    descripcion: line.descripcion,
    precioUnitario: unit,
    precioTotal: total,
  };
}

/**
 * @param {EditProductLine[]} lines
 * @returns {string}
 */
function renderCatalogOptions() {
  return catalogProductos
    .filter((product) => product.activo !== false)
    .map((product) => {
      const price =
        product.precioBase != null ? `$ ${formatQuoteMoney(product.precioBase)}` : 'Consultar';
      const label = `${product.nombre} (${product.codigo ?? product.id}) — ${price}`;
      return `<option value="${escapeHtml(product.id)}">${escapeHtml(label)}</option>`;
    })
    .join('');
}

/**
 * @param {EditProductLine[]} lines
 * @returns {string}
 */
function renderProductsTableBody(lines) {
  if (lines.length === 0) {
    return `<tr><td colspan="6" class="cotizacion-edit__empty">Sin productos. Agrega uno del catálogo.</td></tr>`;
  }

  return lines
    .map(
      (line) => `
        <tr data-line-key="${escapeHtml(line.key)}">
          <td><code>${escapeHtml(line.codigo ?? '—')}</code></td>
          <td>${escapeHtml(line.nombre)}</td>
          <td>${escapeHtml(line.capacidad ?? '—')}</td>
          <td>
            <input class="field__input field__input--sm cotizacion-edit__num" type="number" min="1" step="1" data-field="cantidad" value="${escapeHtml(line.cantidad ?? '1')}" />
          </td>
          <td>
            <input class="field__input field__input--sm cotizacion-edit__num" type="number" min="0" step="1" data-field="precioUnitario" value="${line.precioUnitario ?? ''}" placeholder="Consultar" />
          </td>
          <td>
            <div class="cotizacion-edit__line-actions">
              <input class="field__input field__input--sm cotizacion-edit__num" type="number" min="0" step="1" data-field="precioTotal" value="${line.precioTotal ?? ''}" />
              <button class="btn btn--danger btn--sm" type="button" data-action="remove-line" title="Quitar">×</button>
            </div>
          </td>
        </tr>`
    )
    .join('');
}

/**
 * @param {EditProductLine[]} lines
 * @param {number} envio
 * @returns {string}
 */
function renderTotalsSummary(lines, envio) {
  const subtotal = sumProductsSubtotal(lines.map(toProductRow));
  const total = subtotal + envio;
  const envioLabel = envio > 0 ? `$ ${formatQuoteMoney(envio)}` : 'Por definir';

  return `
    <div class="cotizacion-edit__totals">
      <div class="cotizacion-edit__total-row">
        <span>Subtotal maquinaria</span>
        <strong id="cotizacion-edit-subtotal">$ ${formatQuoteMoney(subtotal)}</strong>
      </div>
      <div class="cotizacion-edit__total-row">
        <span>Envío</span>
        <strong id="cotizacion-edit-envio-label">${escapeHtml(envioLabel)}</strong>
      </div>
      <div class="cotizacion-edit__total-row cotizacion-edit__total-row--grand">
        <span>Total cotización</span>
        <strong id="cotizacion-edit-total">$ ${formatQuoteMoney(total)}</strong>
      </div>
    </div>`;
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @param {EditProductLine[]} lines
 * @returns {string}
 */
function renderEditForm(rawItem, lines) {
  const detail = mapSolicitudToDetail(rawItem);
  const pricing = parsePricing(rawItem);
  const envio = pricing.envio ?? 0;

  return `
    <form class="producto-form panel-card cotizacion-edit" id="cotizacion-edit-form">
      <h2 class="panel-card__title" id="app-detail-modal-title">Editar cotización</h2>
      <p class="config-copy">Los cambios se guardan localmente, se sincronizan con Firebase y el PDF se regenera al guardar.</p>

      <section class="cotizacion-edit__section">
        <h3 class="cotizacion-edit__section-title">Cliente</h3>
        <div class="produccion-form__grid">
          <label class="field field--full">
            <span class="field__label">Nombre</span>
            <input class="field__input" name="cliente" required value="${escapeHtml(String(detail.cliente ?? ''))}" />
          </label>
          <label class="field">
            <span class="field__label">Email</span>
            <input class="field__input" name="email" type="email" value="${escapeHtml(String(detail.email ?? ''))}" />
          </label>
          <label class="field">
            <span class="field__label">Teléfono</span>
            <input class="field__input" name="telefono" value="${escapeHtml(String(detail.telefono ?? ''))}" />
          </label>
        </div>
      </section>

      <section class="cotizacion-edit__section">
        <div class="cotizacion-edit__section-header">
          <h3 class="cotizacion-edit__section-title">Productos</h3>
          <div class="cotizacion-edit__add-row">
            <select class="field__input" id="catalog-product-select">
              <option value="">Agregar del catálogo…</option>
              ${renderCatalogOptions()}
            </select>
            <button class="btn btn--secondary btn--sm" type="button" data-action="add-product">Agregar</button>
          </div>
        </div>
        <div class="report-table-wrap">
          <table class="report-table cotizacion-edit__table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Capacidad</th>
                <th>Cant.</th>
                <th>P. unit.</th>
                <th>Total línea</th>
              </tr>
            </thead>
            <tbody id="cotizacion-edit-products-body">${renderProductsTableBody(lines)}</tbody>
          </table>
        </div>
        <div id="cotizacion-edit-totals-wrap">${renderTotalsSummary(lines, envio)}</div>
      </section>

      <section class="cotizacion-edit__section">
        <h3 class="cotizacion-edit__section-title">Envío y notas</h3>
        <div class="produccion-form__grid">
          <label class="field" id="manual-precio-field"${lines.length > 0 ? ' hidden' : ''}>
            <span class="field__label">Precio maquinaria (CLP)</span>
            <input class="field__input" name="precioFinalManual" type="number" min="0" step="1" value="${pricing.precioFinal ?? ''}" />
          </label>
          <input type="hidden" name="precioFinal" id="cotizacion-edit-precio-hidden" value="${lines.length > 0 ? sumProductsSubtotal(lines.map(toProductRow)) : (pricing.precioFinal ?? '')}" />
          <label class="field">
            <span class="field__label">Envío (CLP, 0 = por definir)</span>
            <input class="field__input" name="envio" type="number" min="0" step="1" value="${envio}" />
          </label>
          <label class="field field--full">
            <span class="field__label">Notas / mensaje</span>
            <textarea class="field__input" name="notas" rows="3">${escapeHtml(String(detail.notas ?? ''))}</textarea>
          </label>
        </div>
      </section>

      <div class="producto-form__actions">
        <button class="btn btn--primary" type="submit">Guardar cambios</button>
        <button class="btn btn--secondary" type="button" data-action="cancel-edit">Cancelar</button>
      </div>
    </form>`;
}

/**
 * @param {HTMLElement} form
 * @param {EditProductLine[]} lines
 */
function syncLinesFromDom(form, lines) {
  for (const line of lines) {
    const row = form.querySelector(`tr[data-line-key="${line.key}"]`);
    if (!(row instanceof HTMLElement)) continue;

    const cantidadInput = row.querySelector('[data-field="cantidad"]');
    const unitInput = row.querySelector('[data-field="precioUnitario"]');
    const totalInput = row.querySelector('[data-field="precioTotal"]');

    if (cantidadInput instanceof HTMLInputElement) {
      line.cantidad = cantidadInput.value || '1';
    }
    if (unitInput instanceof HTMLInputElement) {
      line.precioUnitario = unitInput.value === '' ? null : Number(unitInput.value);
    }
    if (totalInput instanceof HTMLInputElement) {
      line.precioTotal = totalInput.value === '' ? null : Number(totalInput.value);
    }
  }
}

/**
 * @param {HTMLElement} form
 * @param {EditProductLine[]} lines
 */
function refreshProductsUi(form, lines) {
  const tbody = form.querySelector('#cotizacion-edit-products-body');
  if (tbody) tbody.innerHTML = renderProductsTableBody(lines);

  const select = form.querySelector('#catalog-product-select');
  if (select instanceof HTMLSelectElement) {
    const current = select.value;
    select.innerHTML = `<option value="">Agregar del catálogo…</option>${renderCatalogOptions()}`;
    select.value = current;
  }

  const envioInput = form.querySelector('[name="envio"]');
  const envio =
    envioInput instanceof HTMLInputElement && envioInput.value !== ''
      ? Number(envioInput.value)
      : 0;

  const totalsWrap = form.querySelector('#cotizacion-edit-totals-wrap');
  if (totalsWrap) totalsWrap.innerHTML = renderTotalsSummary(lines, envio);

  const manualField = form.querySelector('#manual-precio-field');
  if (manualField instanceof HTMLElement) {
    manualField.hidden = lines.length > 0;
  }

  const hiddenPrecio = form.querySelector('#cotizacion-edit-precio-hidden');
  const manualPrecio = form.querySelector('[name="precioFinalManual"]');
  if (hiddenPrecio instanceof HTMLInputElement) {
    if (lines.length > 0) {
      hiddenPrecio.value = String(sumProductsSubtotal(lines.map(toProductRow)));
    } else if (manualPrecio instanceof HTMLInputElement) {
      hiddenPrecio.value = manualPrecio.value;
    }
  }
}

/**
 * @param {HTMLElement} form
 * @param {EditProductLine[]} lines
 */
function bindProductsTable(form, lines) {
  form.querySelector('[data-action="add-product"]')?.addEventListener('click', () => {
    syncLinesFromDom(form, lines);
    const select = form.querySelector('#catalog-product-select');
    if (!(select instanceof HTMLSelectElement) || !select.value) {
      showToast({ message: 'Selecciona un producto del catálogo.', variant: 'warning' });
      return;
    }

    const producto = catalogProductos.find((entry) => entry.id === select.value);
    if (!producto) return;

    lines.push(lineFromCatalogProduct(producto));
    refreshProductsUi(form, lines);
  });

  form.querySelector('#cotizacion-edit-products-body')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-action="remove-line"]');
    if (!(button instanceof HTMLButtonElement)) return;

    syncLinesFromDom(form, lines);
    const row = button.closest('tr');
    const key = row instanceof HTMLElement ? row.dataset.lineKey : undefined;
    if (!key) return;

    const index = lines.findIndex((line) => line.key === key);
    if (index >= 0) lines.splice(index, 1);
    refreshProductsUi(form, lines);
  });

  form.querySelector('#cotizacion-edit-products-body')?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.field) return;

    syncLinesFromDom(form, lines);

    const row = target.closest('tr');
    const key = row instanceof HTMLElement ? row.dataset.lineKey : undefined;
    const line = lines.find((entry) => entry.key === key);
    if (!line) return;

    if (target.dataset.field === 'cantidad' || target.dataset.field === 'precioUnitario') {
      const qty = Number(line.cantidad) || 1;
      const unit = line.precioUnitario;
      if (unit != null && Number.isFinite(unit)) {
        line.precioTotal = unit * qty;
        const totalInput = row?.querySelector('[data-field="precioTotal"]');
        if (totalInput instanceof HTMLInputElement) {
          totalInput.value = String(line.precioTotal);
        }
      }
    }

    refreshProductsUi(form, lines);
  });

  form.querySelector('[name="envio"]')?.addEventListener('input', () => {
    syncLinesFromDom(form, lines);
    refreshProductsUi(form, lines);
  });

  form.querySelector('[name="precioFinalManual"]')?.addEventListener('input', (event) => {
    if (lines.length > 0) return;
    const target = event.target;
    const hiddenPrecio = form.querySelector('#cotizacion-edit-precio-hidden');
    if (target instanceof HTMLInputElement && hiddenPrecio instanceof HTMLInputElement) {
      hiddenPrecio.value = target.value;
    }
  });
}

/**
 * @param {{id: string} & Record<string, unknown>} rawItem
 * @param {{ onSaved?: (updated: Record<string, unknown>) => void }} [callbacks]
 */
export async function openCotizacionEditModal(rawItem, callbacks = {}) {
  catalogProductos = await listProductos();

  const detail = mapSolicitudToDetail(rawItem);
  /** @type {EditProductLine[]} */
  const editLines = initialEditLines(detail);

  const body = openAppModal();
  body.innerHTML = renderEditForm(rawItem, editLines);

  const form = body.querySelector('#cotizacion-edit-form');
  if (!(form instanceof HTMLFormElement)) return;

  bindProductsTable(form, editLines);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    syncLinesFromDom(form, editLines);

    const data = new FormData(form);
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;

    try {
      const precioRaw = data.get('precioFinal');
      const envioRaw = data.get('envio');
      const productRows = editLines.map(toProductRow);

      const updated = await updateCotizacionSolicitud(
        rawItem.id,
        {
          cliente: String(data.get('cliente') ?? '').trim() || 'Sin cliente',
          email: String(data.get('email') ?? '').trim() || null,
          telefono: String(data.get('telefono') ?? '').trim() || null,
          notas: String(data.get('notas') ?? '').trim() || null,
          products: productRows.length > 0 ? productRows : undefined,
          precioFinal:
            productRows.length > 0
              ? sumProductsSubtotal(productRows)
              : precioRaw === ''
                ? null
                : Number(precioRaw),
          envio: envioRaw === '' ? 0 : Number(envioRaw),
        },
        rawItem
      );

      closeAppModal();
      showToast({
        message: 'Cotización actualizada. El PDF se regenerará con los nuevos datos.',
        variant: 'success',
      });
      callbacks.onSaved?.(updated);
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : formatFirestoreError(error),
        variant: 'error',
      });
    } finally {
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
    }
  });

  body.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => {
    closeAppModal();
  });
}
