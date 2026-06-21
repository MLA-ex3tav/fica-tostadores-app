/**
 * Genera y guarda un PDF del contenido actual usando printToPDF del main process.
 * @param {{ filePath?: string; defaultFileName?: string; printOptions?: Record<string, unknown>; returnBuffer?: boolean }} options
 * @returns {Promise<{ success: boolean; filePath?: string; canceled?: boolean; data?: string }>}
 */
export async function saveReportPdf(options = {}) {
  if (!window.electronAPI) {
    throw new Error('electronAPI no disponible');
  }

  return window.electronAPI.generatePdf(options);
}

/**
 * Abre diálogo nativo para elegir ruta de guardado.
 * @param {string} [defaultFileName]
 * @returns {Promise<{ canceled: boolean; filePath?: string }>}
 */
export async function showSavePdfDialog(defaultFileName) {
  if (!window.electronAPI) {
    throw new Error('electronAPI no disponible');
  }

  return window.electronAPI.showSavePdfDialog(defaultFileName);
}

/**
 * @param {string} base64
 * @param {string} [defaultFileName='cotizacion.pdf']
 */
export async function savePdfFromBase64(base64, defaultFileName = 'cotizacion.pdf') {
  if (!window.electronAPI?.savePdfBuffer) {
    throw new Error('electronAPI no disponible');
  }

  return window.electronAPI.savePdfBuffer(base64, defaultFileName);
}

/**
 * @param {string} base64
 * @returns {Promise<{ success: boolean; canceled?: boolean; message?: string }>}
 */
export async function printPdfFromBase64(base64) {
  if (!window.electronAPI?.printPdfBuffer) {
    throw new Error('electronAPI no disponible');
  }

  const result = await window.electronAPI.printPdfBuffer(base64);
  if (!result?.success) {
    throw new Error(result?.message ?? 'No se pudo imprimir el PDF');
  }

  return result;
}
