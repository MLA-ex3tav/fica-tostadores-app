/**
 * @typedef {{
 *   id: string;
 *   codigo?: string | null;
 *   nombre: string;
 *   modelo?: string | null;
 *   capacidadKg?: number | null;
 *   precioBase?: number | null;
 *   activo?: boolean;
 *   especificaciones?: unknown;
 * }} ProductoRecord
 */

export function isProductosDbAvailable() {
  return Boolean(window.electronAPI?.listProductosLocal);
}

/**
 * @returns {Promise<ProductoRecord[]>}
 */
export async function listProductos() {
  if (!isProductosDbAvailable()) return [];
  const result = await window.electronAPI.listProductosLocal();
  return result.items ?? [];
}

/**
 * @param {ProductoRecord} product
 */
export async function upsertProducto(product) {
  if (!isProductosDbAvailable()) {
    throw new Error('Catálogo local no disponible');
  }
  await window.electronAPI.upsertProductoLocal(product);
}

/**
 * @param {string} id
 */
export async function deleteProducto(id) {
  if (!isProductosDbAvailable()) {
    throw new Error('Catálogo local no disponible');
  }
  await window.electronAPI.deleteProductoLocal(id);
}

/**
 * @returns {string}
 */
export function generateProductoId() {
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
