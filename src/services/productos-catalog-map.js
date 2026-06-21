/**
 * @param {unknown} value
 * @returns {string | null}
 */
function pickString(value) {
  if (value == null || value === '') return null;
  return String(value);
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function pickNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {string} text
 * @returns {number | null}
 */
function parseWeightToKg(text) {
  const normalized = text.toLowerCase();
  const kgMatches = [...normalized.matchAll(/([\d.,]+)\s*kg/g)];
  if (kgMatches.length > 0) {
    const values = kgMatches.map((match) => Number(match[1].replace(',', '.')));
    return Math.max(...values.filter(Number.isFinite));
  }

  const gMatches = [...normalized.matchAll(/([\d.,]+)\s*g(?![a-z])/g)];
  if (gMatches.length > 0) {
    const values = gMatches.map((match) => Number(match[1].replace(',', '.')) / 1000);
    return Math.max(...values.filter(Number.isFinite));
  }

  const bare = normalized.match(/^([\d.,]+)$/);
  if (bare) {
    return pickNumber(bare[1].replace(',', '.'));
  }

  return null;
}

/**
 * @param {string} text
 * @returns {number | null}
 */
function parseCapacityRangeToMaxKg(text) {
  const segments = text.split(/[–—-]/);
  if (segments.length <= 1) return parseWeightToKg(text);

  let maxKg = null;
  for (const segment of segments) {
    const parsed = parseWeightToKg(segment.trim());
    if (parsed != null) {
      maxKg = maxKg == null ? parsed : Math.max(maxKg, parsed);
    }
  }

  return maxKg ?? parseWeightToKg(text);
}

/**
 * @param {unknown} capacityRaw
 * @param {unknown} technicalDetails
 * @returns {number | null}
 */
function parseCapacityKg(capacityRaw, technicalDetails) {
  if (Array.isArray(technicalDetails)) {
    for (const detail of technicalDetails) {
      if (!detail || typeof detail !== 'object') continue;
      const record = /** @type {Record<string, unknown>} */ (detail);
      const label = pickString(record.label)?.toLowerCase() ?? '';
      const value = pickString(record.value);
      if (
        value &&
        (label.includes('capacidad') || label.includes('tambor') || label.includes('máxima'))
      ) {
        const parsed = parseWeightToKg(value);
        if (parsed != null) return parsed;
      }
    }
  }

  if (typeof capacityRaw === 'number') return capacityRaw;
  if (typeof capacityRaw === 'string') {
    const parsed = parseCapacityRangeToMaxKg(capacityRaw);
    if (parsed != null) return parsed;
    const match = capacityRaw.match(/([\d.,]+)/);
    if (match) return pickNumber(match[1].replace(',', '.'));
  }

  return null;
}

/**
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * @param {unknown} images
 * @returns {string | null}
 */
export function resolvePrimaryImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) return null;

  for (const entry of images) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (!entry || typeof entry !== 'object') continue;

    const record = /** @type {Record<string, unknown>} */ (entry);
    const productBlock = record.product;
    if (productBlock && typeof productBlock === 'object') {
      const src = /** @type {{ src?: unknown }} */ (productBlock).src;
      if (typeof src === 'string' && src.trim()) return src.trim();
    }
    if (typeof productBlock === 'string' && productBlock.trim()) return productBlock.trim();

    const carouselBlock = record.carousel;
    if (carouselBlock && typeof carouselBlock === 'object') {
      const src = /** @type {{ src?: unknown }} */ (carouselBlock).src;
      if (typeof src === 'string' && src.trim()) return src.trim();
    }

    if (typeof record.url === 'string' && record.url.trim()) return record.url.trim();
    if (typeof record.src === 'string' && record.src.trim()) return record.src.trim();
  }

  return null;
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} id
 * @returns {boolean}
 */
export function isCatalogTestProduct(item, id) {
  const normalizedId = id.toLowerCase();
  if (normalizedId === 'prueba' || normalizedId.startsWith('prueba-')) return true;

  const catalog = pickString(item.catalog)?.toLowerCase();
  if (catalog === 'prueba') return true;

  const category = pickString(item.category)?.toLowerCase();
  if (!category) return false;
  if (category === 'prueba' || category.startsWith('prueba')) return true;
  if (category === '2' && catalog === 'prueba') return true;

  const name = pickString(item.name ?? item.nombre)?.toLowerCase();
  return name === 'prueba';
}

/**
 * @param {Record<string, unknown>} item
 * @returns {Record<string, unknown>}
 */
function buildCatalogEspecificaciones(item) {
  const images = item.images ?? null;
  return {
    origen: 'firebase',
    catalog: item.catalog ?? null,
    category: item.category ?? null,
    capacity: item.capacity ?? null,
    description: item.description ?? null,
    longDescription: item.longDescription ?? null,
    specs: item.specs ?? null,
    features: item.features ?? null,
    technicalDetails: item.technicalDetails ?? null,
    addOns: item.addOns ?? null,
    images,
    imageUrl: resolvePrimaryImageUrl(images),
    listPrice: item.listPrice ?? null,
    updatedAt: item.updatedAt ?? null,
  };
}

/**
 * @param {unknown} payload
 * @returns {unknown[]}
 */
export function extractProductosArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = /** @type {Record<string, unknown>} */ (payload);
    for (const key of ['productos', 'products', 'items', 'data', 'catalog']) {
      if (Array.isArray(record[key])) {
        return record[key];
      }
    }
  }
  return [];
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @param {string} [fallbackId]
 * @returns {import('./productos.js').ProductoRecord | null}
 */
export function mapCatalogProductToLocal(raw, index, fallbackId) {
  if (typeof raw === 'string') {
    const nombre = raw.trim();
    if (!nombre) return null;
    return {
      id: fallbackId ?? `prod-${slugify(nombre) || index}`,
      codigo: null,
      nombre,
      activo: true,
      especificaciones: { origen: 'firebase' },
    };
  }

  if (!raw || typeof raw !== 'object') return null;

  const item = /** @type {Record<string, unknown>} */ (raw);
  const nombre = pickString(
    item.nombre ?? item.name ?? item.title ?? item.producto ?? item.label
  );
  if (!nombre) return null;

  const id =
    fallbackId ??
    pickString(item.id ?? item.productId ?? item.codigo ?? item.code ?? item.sku) ??
    `prod-${slugify(nombre) || index}`;

  if (isCatalogTestProduct(item, id)) {
    return null;
  }

  const capacidadKg = parseCapacityKg(
    item.capacidadKg ??
      item.capacidad_kg ??
      item.capacityKg ??
      item.capacity ??
      item.capacidad,
    item.technicalDetails
  );

  const precioBase = pickNumber(
    item.precioBase ??
      item.precio_base ??
      item.basePrice ??
      item.listPrice ??
      item.price ??
      item.precio ??
      item.unitPrice ??
      item.precioUnitario
  );

  const activo =
    item.activo ??
    item.active ??
    item.enabled ??
    item.disponible ??
    item.available;

  return {
    id,
    codigo: pickString(item.codigo ?? item.code ?? item.sku ?? item.id),
    nombre,
    modelo: pickString(item.modelo ?? item.model ?? item.category),
    capacidadKg,
    precioBase,
    activo: activo === false || activo === 0 ? false : true,
    especificaciones: buildCatalogEspecificaciones(item),
  };
}
