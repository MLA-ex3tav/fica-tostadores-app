/**
 * Helpers de presentación para productos sincronizados desde Firestore.
 */

import { resolvePrimaryImageUrl } from './productos-catalog-map.js';

/**
 * @param {unknown} images
 * @returns {string | null}
 */
export { resolvePrimaryImageUrl };

/**
 * @param {import('./productos.js').ProductoRecord} product
 * @returns {string | null}
 */
export function getProductImageUrl(product) {
  const specs =
    product.especificaciones && typeof product.especificaciones === 'object'
      ? /** @type {Record<string, unknown>} */ (product.especificaciones)
      : null;

  if (specs) {
    const imageUrl = specs.imageUrl;
    if (typeof imageUrl === 'string' && imageUrl.trim()) return imageUrl.trim();
    return resolvePrimaryImageUrl(specs.images);
  }

  return null;
}

/**
 * @param {unknown} catalogoConfig
 * @param {string | null | undefined} categoryId
 * @returns {string | null}
 */
export function getCategoryLabel(catalogoConfig, categoryId) {
  if (!categoryId) return null;
  if (!catalogoConfig || typeof catalogoConfig !== 'object') return categoryId;

  const categories = /** @type {{ categories?: unknown }} */ (catalogoConfig).categories;
  if (!Array.isArray(categories)) return categoryId;

  for (const entry of categories) {
    if (!entry || typeof entry !== 'object') continue;
    const record = /** @type {{ id?: unknown; label?: unknown }} */ (entry);
    if (record.id === categoryId && typeof record.label === 'string') {
      return record.label;
    }
  }

  return categoryId;
}

/**
 * @param {import('./productos.js').ProductoRecord} product
 * @returns {string | null}
 */
export function getProductCatalogId(product) {
  const specs =
    product.especificaciones && typeof product.especificaciones === 'object'
      ? /** @type {Record<string, unknown>} */ (product.especificaciones)
      : null;

  if (specs && typeof specs.catalog === 'string') return specs.catalog;
  return null;
}

/**
 * @param {unknown} catalogoConfig
 * @param {string | null | undefined} catalogId
 * @returns {string | null}
 */
export function getCatalogLabel(catalogoConfig, catalogId) {
  if (!catalogId) return null;
  if (!catalogoConfig || typeof catalogoConfig !== 'object') return catalogId;

  const catalogs = /** @type {{ catalogs?: unknown }} */ (catalogoConfig).catalogs;
  if (!Array.isArray(catalogs)) return catalogId;

  for (const entry of catalogs) {
    if (!entry || typeof entry !== 'object') continue;
    const record = /** @type {{ id?: unknown; label?: unknown }} */ (entry);
    if (record.id === catalogId && typeof record.label === 'string') {
      return record.label;
    }
  }

  return catalogId;
}

/**
 * @param {unknown} catalogoConfig
 * @param {string | null | undefined} categoryId
 * @returns {{ label: string; description?: string; catalogId?: string } | null}
 */
export function getCategoryMeta(catalogoConfig, categoryId) {
  if (!categoryId) return null;
  if (!catalogoConfig || typeof catalogoConfig !== 'object') {
    return { label: categoryId };
  }

  const categories = /** @type {{ categories?: unknown }} */ (catalogoConfig).categories;
  if (!Array.isArray(categories)) return { label: categoryId };

  for (const entry of categories) {
    if (!entry || typeof entry !== 'object') continue;
    const record = /** @type {{ id?: unknown; label?: unknown; description?: unknown; catalogId?: unknown }} */ (
      entry
    );
    if (record.id !== categoryId) continue;
    return {
      label: typeof record.label === 'string' ? record.label : categoryId,
      description: typeof record.description === 'string' ? record.description : undefined,
      catalogId: typeof record.catalogId === 'string' ? record.catalogId : undefined,
    };
  }

  return { label: categoryId };
}

/**
 * @param {unknown} catalogoConfig
 * @param {string | null | undefined} categoryId
 * @returns {boolean}
 */
function isTestCategory(catalogoConfig, categoryId) {
  if (!categoryId) return false;
  if (categoryId === 'prueba' || categoryId.startsWith('prueba')) return true;

  const meta = getCategoryMeta(catalogoConfig, categoryId);
  return meta?.catalogId === 'prueba';
}

/**
 * @typedef {{
 *   catalogId: string;
 *   catalogLabel: string;
 *   sections: Array<{
 *     categoryId: string;
 *     label: string;
 *     description?: string;
 *     products: import('./productos.js').ProductoRecord[];
 *   }>;
 * }} ProductosCatalogGroup
 */

/**
 * @param {import('./productos.js').ProductoRecord[]} products
 * @param {unknown} catalogoConfig
 * @returns {ProductosCatalogGroup[]}
 */
export function groupProductsByCatalog(products, catalogoConfig) {
  const visible = products.filter((product) => product.activo !== false);

  /** @type {Map<string, import('./productos.js').ProductoRecord[]>} */
  const byCategory = new Map();
  /** @type {import('./productos.js').ProductoRecord[]} */
  const uncategorized = [];

  for (const product of visible) {
    const categoryId = getProductCategoryId(product);
    if (!categoryId || isTestCategory(catalogoConfig, categoryId)) {
      continue;
    }

    const meta = getCategoryMeta(catalogoConfig, categoryId);
    if (!meta || meta.catalogId === 'prueba') {
      uncategorized.push(product);
      continue;
    }

    if (!byCategory.has(categoryId)) {
      byCategory.set(categoryId, []);
    }
    byCategory.get(categoryId)?.push(product);
  }

  for (const list of byCategory.values()) {
    list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  }
  uncategorized.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

  const config =
    catalogoConfig && typeof catalogoConfig === 'object'
      ? /** @type {{ categories?: unknown; catalogs?: unknown }} */ (catalogoConfig)
      : null;

  const rawCatalogs = Array.isArray(config?.catalogs) ? config.catalogs : [];
  const rawCategories = Array.isArray(config?.categories) ? config.categories : [];

  /** @type {Array<{ id: string; label: string }>} */
  const catalogOrder = rawCatalogs
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const record = /** @type {{ id?: unknown; label?: unknown }} */ (entry);
      return {
        id: typeof record.id === 'string' ? record.id : '',
        label: typeof record.label === 'string' ? record.label : String(record.id ?? ''),
      };
    })
    .filter((entry) => entry.id && entry.id !== 'prueba');

  /** @type {ProductosCatalogGroup[]} */
  const groups = [];

  for (const catalog of catalogOrder) {
    /** @type {ProductosCatalogGroup['sections']} */
    const sections = [];

    for (const entry of rawCategories) {
      if (!entry || typeof entry !== 'object') continue;
      const record = /** @type {{ id?: unknown; label?: unknown; description?: unknown; catalogId?: unknown }} */ (
        entry
      );
      const categoryId = typeof record.id === 'string' ? record.id : '';
      if (!categoryId || record.catalogId !== catalog.id) continue;
      if (isTestCategory(catalogoConfig, categoryId)) continue;

      const productsInCategory = byCategory.get(categoryId) ?? [];
      if (productsInCategory.length === 0) continue;

      sections.push({
        categoryId,
        label: typeof record.label === 'string' ? record.label : categoryId,
        description: typeof record.description === 'string' ? record.description : undefined,
        products: productsInCategory,
      });
    }

    if (sections.length > 0) {
      groups.push({
        catalogId: catalog.id,
        catalogLabel: catalog.label,
        sections,
      });
    }
  }

  /** @type {Set<string>} */
  const assignedCategoryIds = new Set();
  for (const group of groups) {
    for (const section of group.sections) {
      assignedCategoryIds.add(section.categoryId);
    }
  }

  /** @type {ProductosCatalogGroup['sections']} */
  const orphanSections = [];
  for (const [categoryId, categoryProducts] of byCategory.entries()) {
    if (assignedCategoryIds.has(categoryId)) continue;
    const meta = getCategoryMeta(catalogoConfig, categoryId);
    orphanSections.push({
      categoryId,
      label: meta?.label ?? categoryId,
      description: meta?.description,
      products: categoryProducts,
    });
  }

  if (orphanSections.length > 0) {
    groups.push({
      catalogId: '_sin_catalogo',
      catalogLabel: 'Sin catálogo asignado',
      sections: orphanSections,
    });
  }

  if (uncategorized.length > 0) {
    groups.push({
      catalogId: '_otros',
      catalogLabel: 'Otros',
      sections: [
        {
          categoryId: '_sin_categoria',
          label: 'Sin categoría',
          products: uncategorized,
        },
      ],
    });
  }

  return groups;
}

/**
 * @param {ProductosCatalogGroup[]} groups
 * @param {string | null | undefined} activeCatalogId
 * @returns {ProductosCatalogGroup | null}
 */
export function getActiveCatalogGroup(groups, activeCatalogId) {
  if (groups.length === 0) return null;
  if (activeCatalogId) {
    const match = groups.find((group) => group.catalogId === activeCatalogId);
    if (match) return match;
  }
  return groups[0] ?? null;
}

/**
 * @param {ProductosCatalogGroup[]} groups
 * @param {string | null | undefined} activeCatalogId
 * @returns {string | null}
 */
export function resolveActiveCatalogId(groups, activeCatalogId) {
  return getActiveCatalogGroup(groups, activeCatalogId)?.catalogId ?? null;
}

/**
 * @param {import('./productos.js').ProductoRecord} product
 * @returns {string | null}
 */
export function getProductCategoryId(product) {
  const specs =
    product.especificaciones && typeof product.especificaciones === 'object'
      ? /** @type {Record<string, unknown>} */ (product.especificaciones)
      : null;

  if (specs && typeof specs.category === 'string') return specs.category;
  return product.modelo ?? null;
}

/**
 * @param {import('./productos.js').ProductoRecord} product
 * @returns {string}
 */
export function formatProductCapacity(product) {
  const specs =
    product.especificaciones && typeof product.especificaciones === 'object'
      ? /** @type {Record<string, unknown>} */ (product.especificaciones)
      : null;

  if (specs && typeof specs.capacity === 'string' && specs.capacity.trim()) {
    return specs.capacity.trim();
  }

  if (product.capacidadKg != null && Number.isFinite(product.capacidadKg)) {
    const kg = product.capacidadKg;
    if (kg < 1) {
      const grams = Math.round(kg * 1000);
      return `${grams} g`;
    }
    return `${kg} kg`;
  }

  return '—';
}
