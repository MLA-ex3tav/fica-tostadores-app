/**
 * Ruta del logo en el servidor del renderer (cotización PDF).
 */
import { getCachedAppSettings } from '../services/app-settings.js';

const QUOTE_LOGO_SRC = '/assets/logo.webp';

/**
 * @param {import('firebase/firestore').Timestamp | Date | string | undefined} value
 * @returns {string}
 */
function formatEmissionDate(value) {
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return value.toDate().toLocaleDateString('es-CL');
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('es-CL');
  }
  return new Date().toLocaleDateString('es-CL');
}

/**
 * Formato moneda chilena (CLP): sin decimales, separador de miles con punto.
 * @param {number} amount
 * @returns {string}
 */
export function formatQuoteMoney(amount) {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * @param {number | null | undefined} envio
 * @returns {string}
 */
export function formatEnvioDisplay(envio) {
  const amount = envio ?? 0;
  if (amount > 0) {
    return `$ ${formatQuoteMoney(amount)}`;
  }
  return 'Por definir';
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
 * @param {string | null | undefined} value
 * @returns {string}
 */
function field(value) {
  if (value == null || value === '') return '—';
  return escapeHtml(String(value));
}

/**
 * @param {ReturnType<import('../services/cotizaciones.js').mapSolicitudToDetail>} detail
 * @param {{ precioFinal: number; envio: number; quoteNumber?: string }} pricing
 * @returns {string}
 */
export function renderFicaQuoteHtml(detail, pricing) {
  const { precioFinal, envio } = pricing;
  const total = precioFinal + envio;
  const quoteNumber = pricing.quoteNumber ?? detail.quoteNumber ?? detail.id.slice(-6).toUpperCase();
  const emissionDate = formatEmissionDate(detail.createdAt);

  const productRows =
    detail.productos.length > 0
      ? detail.productos
          .map((product, index) => {
            const cantidad = Number(product.cantidad) || 1;
            const lineTotal =
              product.precioTotal ??
              (detail.productos.length === 1 ? precioFinal : index === 0 ? precioFinal : 0);
            const unitPrice =
              product.precioUnitario ??
              (lineTotal != null && cantidad > 0 ? lineTotal / cantidad : null);

            return `
        <tr>
          <td>${field(product.codigo ?? product.modelo ?? String(index + 1).padStart(2, '0'))}</td>
          <td>${field([product.nombre, product.capacidad].filter(Boolean).join(' — ') || product.nombre)}</td>
          <td class="fica-quote__num">${unitPrice != null ? formatQuoteMoney(unitPrice) : '—'}</td>
          <td class="fica-quote__num">${cantidad}</td>
          <td class="fica-quote__num">${lineTotal != null && lineTotal > 0 ? formatQuoteMoney(lineTotal) : '—'}</td>
        </tr>`;
          })
          .join('')
      : `
        <tr>
          <td>—</td>
          <td>Sin maquinaria seleccionada</td>
          <td class="fica-quote__num">${formatQuoteMoney(precioFinal)}</td>
          <td class="fica-quote__num">1</td>
          <td class="fica-quote__num">${formatQuoteMoney(precioFinal)}</td>
        </tr>`;

  const cuit = detail.cuit ?? detail.dni ?? detail.ruc ?? null;
  const pais = detail.pais ?? detail.country ?? null;
  const origen = detail.origen ?? detail.origin ?? null;
  const destino = detail.destino ?? detail.destination ?? null;
  const settings = getCachedAppSettings();
  const adminEmail = settings.empresaEmail ?? 'ADMINISTRACION@TOSTADORESFICA.CL';

  return `
    <article class="fica-quote">
      <header class="fica-quote__top">
        <div class="fica-quote__logo-main">
          <img class="fica-quote__logo-img" src="${QUOTE_LOGO_SRC}" alt="Fica Tostadores" width="160" height="72" />
        </div>
        <div class="fica-quote__company-box">
          <strong>TOSTADORES FICA LTDA - RUT 76.683.592-9</strong>
          <p>FÁBRICA DE MAQUINARIAS - COMPRA Y VENTA DE FRUTOS SECOS</p>
          <p>CASA MATRIZ SAN RAMON PC. 39 LT. 12 - 19, PADRE LAS CASAS</p>
          <p>TELÉFONO MÓVIL +56 9 85088171 - EMAIL TOSTADORESFICA@GMAIL.COM</p>
          <p>WWW.TOSTADORESFICA.CL / ${field(adminEmail)}</p>
        </div>
      </header>

      <div class="fica-quote__meta-bar">
        <span>COTIZACIÓN N° ${field(quoteNumber)}</span>
        <span>FECHA EMISIÓN: ${emissionDate}</span>
        <span>VALIDEZ: 10 DÍAS</span>
      </div>

      <table class="fica-quote__client-grid">
        <tbody>
          <tr>
            <th>NOMBRE</th>
            <td>${field(String(detail.cliente))}</td>
            <th>DNI/RUC/CUIT</th>
            <td>${field(cuit)}</td>
          </tr>
          <tr>
            <th>DIRECCIÓN</th>
            <td>${field(detail.direccion)}</td>
            <th>PAÍS</th>
            <td>${field(pais)}</td>
          </tr>
          <tr>
            <th>E-MAIL</th>
            <td>${field(detail.email)}</td>
            <th>TELÉFONO</th>
            <td>${field(detail.telefono)}</td>
          </tr>
          <tr>
            <th>ORIGEN</th>
            <td>${field(origen)}</td>
            <th>ZIP CODE</th>
            <td>${field(detail.zipOrigen ?? detail.zipCode)}</td>
          </tr>
          <tr>
            <th>DESTINO</th>
            <td>${field(destino)}</td>
            <th>ZIP CODE</th>
            <td>${field(detail.zipDestino)}</td>
          </tr>
        </tbody>
      </table>

      <table class="fica-quote__products">
        <thead>
          <tr>
            <th>CÓDIGO</th>
            <th>PRODUCTO</th>
            <th>VALOR UNIDAD</th>
            <th>CANTIDAD</th>
            <th>VALOR TOTAL</th>
          </tr>
        </thead>
        <tbody>${productRows}</tbody>
      </table>

      <div class="fica-quote__footer-grid">
        <div class="fica-quote__obs">
          <strong>OBSERVACIÓN:</strong>
          <p>${field(detail.notas ? String(detail.notas) : null)}</p>
        </div>
        <table class="fica-quote__totals">
          <tbody>
            <tr>
              <th>SUBTOTAL</th>
              <td>$ ${formatQuoteMoney(precioFinal)}</td>
            </tr>
            <tr>
              <th>ENVÍO</th>
              <td>${formatEnvioDisplay(envio)}</td>
            </tr>
            <tr>
              <th>DESCUENTO</th>
              <td>—</td>
            </tr>
            <tr class="fica-quote__totals-total">
              <th>TOTAL</th>
              <td>$ ${formatQuoteMoney(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="fica-quote__terms">
        <p class="fica-quote__terms-warn">
          COSTOS NO INCLUYEN TRAMITACIÓN POR ADUANA DE OTRO PAÍS DISTINTO A CHILE.
        </p>
        <p>1 AÑO DE GARANTÍA, DISPONIBILIDAD DE SERVICIO POSVENTA Y SERVICIO TÉCNICO.</p>
        <p>LA FABRICACIÓN DEL EQUIPO TIENE UN PLAZO DE 25 DÍAS HÁBILES, PUEDE VARIAR 5 DÍAS HÁBILES.</p>
        <p>EL TIEMPO DE ENTREGA DEL TRANSPORTE INTERNACIONAL VARÍA SEGÚN EL TIPO DE SERVICIO DE LA EMPRESA DE TRANSPORTE.</p>
      </div>

      <div class="fica-quote__bottom">
        <div class="fica-quote__bottom-col">
          <strong>DATOS EMPRESA</strong>
          <p>TOSTADORES FICA LTDA.</p>
          <p>RUT: 76.683.592-9</p>
          <p>GIRO: REPARACIÓN Y MANTENCIÓN DE MAQ.</p>
          <p>DIRECCIÓN PRINCIPAL: SAN RAMON PC. 39 LT. 12 - 19, PADRE LAS CASAS</p>
        </div>
        <div class="fica-quote__bottom-col">
          <strong>FORMAS DE PAGO</strong>
          <p>TRANSFERENCIA ELECTRÓNICA CON REMESA</p>
          <p>SISTEMA DE PAGO PAY PAL INTERNACIONAL</p>
          <p>EFECTIVO RECIBIDO POR TERCEROS</p>
        </div>
      </div>

      <p class="fica-quote__experience">15 AÑOS DE EXPERIENCIA</p>
    </article>
  `;
}

/**
 * @param {ReturnType<import('../services/cotizaciones.js').mapSolicitudToDetail>} detail
 * @param {{ precioFinal: number; envio: number; quoteNumber?: string }} pricing
 */
export function mountFicaQuotePdfSource(detail, pricing) {
  const mount = document.getElementById('fica-quote-pdf-source');
  if (!mount) {
    throw new Error('Contenedor PDF no encontrado');
  }
  mount.innerHTML = renderFicaQuoteHtml(detail, pricing);
  mount.hidden = false;
}

export function unmountFicaQuotePdfSource() {
  const mount = document.getElementById('fica-quote-pdf-source');
  if (!mount) return;
  mount.innerHTML = '';
  mount.hidden = true;
}

/** Espera a que las imágenes del PDF (logo) terminen de cargar antes de printToPDF. */
export function waitForQuotePdfAssets() {
  const mount = document.getElementById('fica-quote-pdf-source');
  if (!mount) return Promise.resolve();

  const images = mount.querySelectorAll('img');
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    Array.from(images).map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((resolve, reject) => {
              img.addEventListener('load', () => resolve(undefined), { once: true });
              img.addEventListener(
                'error',
                () => reject(new Error('No se pudo cargar el logo del PDF')),
                { once: true },
              );
            }),
    ),
  );
}
