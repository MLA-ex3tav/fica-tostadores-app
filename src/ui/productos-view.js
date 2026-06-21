import { listProductos, upsertProducto, deleteProducto, generateProductoId } from '../services/productos.js';
import { runProductosSync } from './sync-productos.js';
import { getCachedAppSettings, loadAppSettings } from '../services/app-settings.js';
import {
  formatProductCapacity,
  getActiveCatalogGroup,
  groupProductsByCatalog,
  resolveActiveCatalogId,
} from '../services/productos-display.js';
import { formatQuoteMoney } from './quote-pdf-template.js';
import { confirmDialog, showToast } from './app-alerts.js';
import { escapeHtml } from './view-utils.js';
import { openAppModal, closeAppModal } from './app-modal.js';

/** @type {HTMLElement | null} */
let root = null;

/** @type {import('../services/productos.js').ProductoRecord[]} */
let lastProductos = [];

/** @type {import('../services/productos.js').ProductoRecord | null} */
let editingProduct = null;

/** @type {string | null} */
let activeCatalogId = null;

/**
 * @param {import('../services/productos.js').ProductoRecord | null} [product]
 */
function renderForm(product = null) {
  const current = product ?? editingProduct;
  return `
    <form class="producto-form panel-card" id="producto-form">
      <h2 class="panel-card__title" id="app-detail-modal-title">${current ? 'Editar producto' : 'Nuevo producto'}</h2>
      <input type="hidden" name="id" value="${escapeHtml(current?.id ?? generateProductoId())}" />
      <div class="produccion-form__grid">
        <label class="field"><span class="field__label">Código</span><input class="field__input" name="codigo" value="${escapeHtml(current?.codigo ?? '')}" /></label>
        <label class="field"><span class="field__label">Nombre</span><input class="field__input" name="nombre" required value="${escapeHtml(current?.nombre ?? '')}" /></label>
        <label class="field"><span class="field__label">Modelo</span><input class="field__input" name="modelo" value="${escapeHtml(current?.modelo ?? '')}" /></label>
        <label class="field"><span class="field__label">Capacidad (kg)</span><input class="field__input" name="capacidadKg" type="number" step="0.1" value="${current?.capacidadKg ?? ''}" /></label>
        <label class="field"><span class="field__label">Precio base</span><input class="field__input" name="precioBase" type="number" step="0.01" value="${current?.precioBase ?? ''}" /></label>
        <label class="field field--checkbox">
          <input type="checkbox" name="activo"${current?.activo === false ? '' : ' checked'} />
          <span>Activo en catálogo</span>
        </label>
        <label class="field field--full">
          <span class="field__label">Especificaciones</span>
          <textarea class="field__input" name="especificaciones" rows="3">${escapeHtml(typeof current?.especificaciones === 'string' ? current.especificaciones : '')}</textarea>
        </label>
      </div>
      <div class="producto-form__actions">
        <button class="btn btn--primary" type="submit">Guardar producto</button>
        ${current ? '<button class="btn btn--danger" type="button" data-action="delete-producto">Eliminar</button>' : ''}
        <button class="btn btn--secondary" type="button" data-action="cancel-edit">Cancelar</button>
      </div>
    </form>`;
}

/**
 * @param {HTMLElement} container
 */
function bindFormActions(container) {
  container.querySelector('#producto-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;
    const data = new FormData(form);
    await upsertProducto({
      id: String(data.get('id')),
      codigo: String(data.get('codigo') ?? '') || null,
      nombre: String(data.get('nombre') ?? 'Producto'),
      modelo: String(data.get('modelo') ?? '') || null,
      capacidadKg: data.get('capacidadKg') ? Number(data.get('capacidadKg')) : null,
      precioBase: data.get('precioBase') ? Number(data.get('precioBase')) : null,
      activo: data.get('activo') === 'on',
      especificaciones: String(data.get('especificaciones') ?? ''),
    });
    editingProduct = null;
    closeAppModal();
    showToast({ message: 'Producto guardado.', variant: 'success' });
    await renderProductos();
  });

  container.querySelector('[data-action="delete-producto"]')?.addEventListener('click', async () => {
    const form = container.querySelector('#producto-form');
    if (!(form instanceof HTMLFormElement)) return;
    const id = String(new FormData(form).get('id'));
    const confirmed = await confirmDialog({
      title: 'Eliminar producto',
      message: '¿Eliminar este producto del catálogo local?',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!confirmed) return;
    await deleteProducto(id);
    editingProduct = null;
    closeAppModal();
    showToast({ message: 'Producto eliminado.', variant: 'success' });
    await renderProductos();
  });

  container.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => {
    editingProduct = null;
    closeAppModal();
  });
}

/**
 * @param {import('../services/productos.js').ProductoRecord | null} [product]
 */
function openProductoModal(product = null) {
  editingProduct = product;
  const body = openAppModal({
    onClose: () => {
      editingProduct = null;
    },
  });
  body.innerHTML = renderForm(product);
  bindFormActions(body);
}

/**
 * @param {import('../services/productos.js').ProductoRecord} product
 */
function renderProductRow(product) {
  const capacityLabel = formatProductCapacity(product);
  const priceLabel =
    product.precioBase != null ? `$ ${formatQuoteMoney(product.precioBase)}` : 'Consultar';

  return `
    <tr>
      <td><code class="productos-table__id">${escapeHtml(product.codigo ?? product.id)}</code></td>
      <td>${escapeHtml(product.nombre)}</td>
      <td>${escapeHtml(capacityLabel)}</td>
      <td>${priceLabel === 'Consultar' ? '<span class="productos-table__price-muted">Consultar</span>' : escapeHtml(priceLabel)}</td>
      <td><button class="btn btn--secondary btn--sm" type="button" data-edit="${escapeHtml(product.id)}">Ver / editar</button></td>
    </tr>`;
}

/**
 * @param {import('../services/productos-display.js').ProductosCatalogGroup} group
 */
function renderCatalogPanel(group) {
  const count = group.sections.reduce((total, section) => total + section.products.length, 0);

  return `
    <div class="productos-catalog-panel" data-catalog-panel="${escapeHtml(group.catalogId)}">
      <p class="productos-catalog-panel__count">${count} equipo${count === 1 ? '' : 's'}</p>
      ${group.sections
        .map(
          (section) => `
            <div class="productos-category" data-category="${escapeHtml(section.categoryId)}">
              <div class="productos-category__header">
                <h4 class="productos-category__title">${escapeHtml(section.label)}</h4>
                ${
                  section.description
                    ? `<p class="productos-category__description">${escapeHtml(section.description)}</p>`
                    : ''
                }
              </div>
              <div class="report-table-wrap">
                <table class="report-table productos-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nombre</th>
                      <th>Capacidad</th>
                      <th>Precio lista</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${section.products.map((product) => renderProductRow(product)).join('')}
                  </tbody>
                </table>
              </div>
            </div>`
        )
        .join('')}
    </div>`;
}

/**
 * @param {import('../services/productos-display.js').ProductosCatalogGroup[]} groups
 * @param {string | null} currentCatalogId
 */
function renderCatalogTabs(groups, currentCatalogId) {
  return `
    <div class="productos-tabs" role="tablist" aria-label="Catálogos">
      ${groups
        .map((group) => {
          const isActive = group.catalogId === currentCatalogId;
          const count = group.sections.reduce((total, section) => total + section.products.length, 0);
          return `
            <button
              class="productos-tabs__tab${isActive ? ' productos-tabs__tab--active' : ''}"
              type="button"
              role="tab"
              aria-selected="${isActive ? 'true' : 'false'}"
              data-catalog-tab="${escapeHtml(group.catalogId)}"
            >
              ${escapeHtml(group.catalogLabel)}
              <span class="productos-tabs__badge">${count}</span>
            </button>`;
        })
        .join('')}
    </div>`;
}

/**
 * @param {import('../services/app-settings.js').AppSettings['catalogoConfig']} catalogoConfig
 * @param {import('../services/productos.js').ProductoRecord[]} visibleProductos
 */
function renderTabbedProductos(catalogoConfig, visibleProductos) {
  const groups = groupProductsByCatalog(visibleProductos, catalogoConfig);

  if (groups.length === 0) {
    return '<p class="dashboard-empty">Sin productos en el catálogo local. Usa «Sincronizar desde Firebase».</p>';
  }

  activeCatalogId = resolveActiveCatalogId(groups, activeCatalogId);
  const activeGroup = getActiveCatalogGroup(groups, activeCatalogId);
  if (!activeGroup) {
    return '<p class="dashboard-empty">Sin productos en el catálogo seleccionado.</p>';
  }

  return `
    ${renderCatalogTabs(groups, activeCatalogId)}
    ${renderCatalogPanel(activeGroup)}
  `;
}

function bindProductosActions() {
  if (!root) return;

  root.querySelector('[data-action="new-producto"]')?.addEventListener('click', () => {
    openProductoModal(null);
  });

  root.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!(button instanceof HTMLButtonElement) || !button.dataset.edit) return;
      const product = lastProductos.find((entry) => entry.id === button.dataset.edit) ?? null;
      openProductoModal(product);
    });
  });

  root.querySelectorAll('[data-catalog-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!(button instanceof HTMLButtonElement) || !button.dataset.catalogTab) return;
      activeCatalogId = button.dataset.catalogTab;
      void renderProductos();
    });
  });

  root.querySelector('[data-action="sync-firebase"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = true;
    try {
      const result = await runProductosSync({
        reason: 'manual',
        force: true,
        notifyOnError: true,
      });
      showToast({
        message: `Catálogo sincronizado: ${result?.imported ?? 0} productos${
          result?.skipped ? ` (${result.skipped} de prueba omitidos)` : ''
        }.`,
        variant: 'success',
      });
      await renderProductos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo sincronizar el catálogo';
      showToast({ message, variant: 'error' });
    } finally {
      button.disabled = false;
    }
  });
}

async function renderProductos() {
  if (!root) return;

  lastProductos = await listProductos();

  await loadAppSettings();
  const settings = getCachedAppSettings();
  const catalogoConfig = settings.catalogoConfig ?? null;
  const lastSyncAt =
    typeof settings.productosLastSyncAt === 'string' ? settings.productosLastSyncAt : null;
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString('es-CL')
    : 'Nunca';

  const visibleProductos = lastProductos.filter((product) => product.activo !== false);

  root.innerHTML = `
    <section class="panel-card productos-layout">
      <div class="panel-card__header-row">
        <h2 class="panel-card__title">Catálogo (Firebase)</h2>
        <div class="productos-sync-actions">
          <button class="btn btn--secondary btn--sm" type="button" data-action="new-producto">Nuevo producto local</button>
          <button class="btn btn--primary btn--sm" type="button" data-action="sync-firebase">Sincronizar desde Firebase</button>
        </div>
      </div>
      <p class="config-copy">Última sincronización: ${escapeHtml(lastSyncLabel)} · ${visibleProductos.length} producto(s) activo(s)</p>
      <div class="productos-tabbed">
        ${visibleProductos.length === 0 ? '<p class="dashboard-empty">Sin productos en el catálogo local. Usa «Sincronizar desde Firebase».</p>' : renderTabbedProductos(catalogoConfig, visibleProductos)}
      </div>
    </section>
  `;

  bindProductosActions();
}

export function initProductosView() {
  root = document.getElementById('productos-root');
}

export function renderProductosView() {
  void (async () => {
    await renderProductos();
    const result = await runProductosSync({ reason: 'view', notifyOnError: false });
    if (result && !result.skipped) {
      await renderProductos();
    }
  })();
}
