import { mountFicaQuotePdfSource, unmountFicaQuotePdfSource, waitForQuotePdfAssets } from './quote-pdf-template.js';

/** @type {string | null} */
let currentBlobUrl = null;

/** @type {string | null} */
let currentPdfBase64 = null;

/** @type {string} */
let currentFileName = 'cotizacion.pdf';

/** @type {(() => void) | null} */
let onCloseCallback = null;

/**
 * @param {string} base64
 * @returns {Uint8Array}
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getModalElements() {
  return {
    modal: document.getElementById('pdf-preview-modal'),
    container: document.getElementById('pdf-preview-container'),
    error: document.getElementById('pdf-preview-error'),
  };
}

function showPreviewError(message) {
  const { error } = getModalElements();
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function clearPreviewError() {
  const { error } = getModalElements();
  if (!error) return;
  error.textContent = '';
  error.hidden = true;
}

function waitForLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function destroyPdfViewer() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  const { container } = getModalElements();
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * @param {Uint8Array} pdfBytes
 */
async function renderPdfInViewer(pdfBytes) {
  const { container } = getModalElements();
  if (!container) {
    throw new Error('Visor PDF no encontrado');
  }

  destroyPdfViewer();

  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  currentBlobUrl = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.className = 'pdf-preview__iframe';
  iframe.title = 'Vista previa del PDF';
  iframe.setAttribute('loading', 'eager');

  const loadPromise = new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(undefined), { once: true });
    iframe.addEventListener(
      'error',
      () => reject(new Error('El visor no pudo cargar el PDF')),
      { once: true },
    );
  });

  container.appendChild(iframe);
  iframe.src = currentBlobUrl;

  await loadPromise;
}

function bindModalActions() {
  const { modal } = getModalElements();
  if (!modal || modal.dataset.bound === 'true') return;

  modal.querySelector('[data-action="pdf-close"]')?.addEventListener('click', () => {
    closePdfPreview();
  });

  modal.querySelector('[data-action="pdf-download"]')?.addEventListener('click', async () => {
    if (!currentPdfBase64 || !window.electronAPI?.savePdfBuffer) return;

    const button = modal.querySelector('[data-action="pdf-download"]');
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
    }

    try {
      await window.electronAPI.savePdfBuffer(currentPdfBase64, currentFileName);
    } catch (error) {
      console.error('[pdf-preview]', error);
      showPreviewError('No se pudo guardar el PDF.');
    } finally {
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
      }
    }
  });

  modal.querySelector('.pdf-preview__backdrop')?.addEventListener('click', () => {
    closePdfPreview();
  });

  modal.dataset.bound = 'true';
}

/**
 * @param {string} base64
 * @param {string} fileName
 * @param {{ onClose?: () => void }} [options]
 */
export async function openPdfPreview(base64, fileName, options = {}) {
  const { modal } = getModalElements();
  if (!modal) {
    throw new Error('Modal de vista previa no encontrado');
  }

  bindModalActions();
  clearPreviewError();

  currentPdfBase64 = base64;
  currentFileName = fileName;
  onCloseCallback = options.onClose ?? null;

  modal.hidden = false;
  document.body.classList.add('pdf-preview-open');
  await waitForLayout();

  try {
    const bytes = base64ToUint8Array(base64);
    if (bytes.byteLength === 0) {
      throw new Error('El PDF está vacío');
    }
    await renderPdfInViewer(bytes);
  } catch (error) {
    console.error('[pdf-preview]', error);
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    showPreviewError(`No se pudo cargar la vista previa del PDF. ${detail}`);
    throw error;
  }
}

export function closePdfPreview() {
  const { modal } = getModalElements();
  destroyPdfViewer();
  clearPreviewError();

  if (modal) {
    modal.hidden = true;
  }

  document.body.classList.remove('pdf-preview-open');
  currentPdfBase64 = null;

  const callback = onCloseCallback;
  onCloseCallback = null;
  callback?.();
}

/**
 * Genera el PDF de cotización y devuelve base64 (sin abrir preview).
 * @param {ReturnType<import('../services/cotizaciones.js').mapSolicitudToDetail>} detail
 * @param {{ precioFinal: number; envio: number }} pricing
 * @returns {Promise<string>}
 */
export async function generateQuotePdfBuffer(detail, pricing) {
  if (!window.electronAPI?.generatePdf) {
    throw new Error('electronAPI no disponible');
  }

  mountFicaQuotePdfSource(detail, pricing);
  document.body.classList.add('fica-quote-print-mode');

  await waitForLayout();
  await waitForQuotePdfAssets();

  try {
    const result = await window.electronAPI.generatePdf({
      returnBuffer: true,
      printOptions: {
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize: 'A4',
      },
    });

    if (!result.success || !result.data) {
      throw new Error('No se pudo generar el PDF');
    }

    return result.data;
  } finally {
    document.body.classList.remove('fica-quote-print-mode');
    unmountFicaQuotePdfSource();
  }
}

/**
 * @param {ReturnType<import('../services/cotizaciones.js').mapSolicitudToDetail>} detail
 * @param {{ precioFinal: number; envio: number }} pricing
 * @param {string} fileName
 * @param {{ onClose?: () => void }} [options]
 */
export async function previewQuotePdf(detail, pricing, fileName, options = {}) {
  const base64 = await generateQuotePdfBuffer(detail, pricing);
  await openPdfPreview(base64, fileName, options);
  return { success: true, data: base64 };
}

export function initPdfPreview() {
  bindModalActions();
}
