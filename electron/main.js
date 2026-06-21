const path = require('path');
const fs = require('fs').promises;
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createRendererServer } = require('./renderer-server');
const { signInWithGoogleBrowser } = require('./google-oauth');
const {
  initSolicitudesDb,
  closeSolicitudesDb,
  importFromFirebase,
  updateSolicitudLocal,
  deleteSolicitudLocalSoft,
  purgeSolicitudLocal,
  markSolicitudSynced,
  listPendingSync,
  countPendingSync,
  listAllSolicitudes,
  getAppSetting,
  setAppSetting,
  getAllAppSettings,
  listProductos,
  upsertProducto,
  deleteProducto,
  syncProductosBatch,
} = require('./db/solicitudes-db');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {import('http').Server | null} */
let rendererServer = null;

/** @type {string | null} */
let rendererOrigin = null;

const isDev = !app.isPackaged;
const showDevTools = process.argv.includes('--dev');

/** Icono de ventana / barra de tareas (Windows, macOS, Linux) */
const APP_ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.png');

/** Sesión persistente de la ventana principal */
const AUTH_PARTITION = 'persist:fica-auth';

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update-downloaded', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-not-available', {});
  });

  autoUpdater.on('error', (error) => {
    console.error('[autoUpdater]', error.message);
    sendToRenderer('update-error', { message: error.message });
  });
}

function checkForUpdates() {
  if (isDev) {
    console.log('[autoUpdater] Omitido en desarrollo');
    return;
  }

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[autoUpdater] checkForUpdates failed:', error.message);
  });
}

async function ensureRendererServer() {
  if (rendererOrigin) {
    return rendererOrigin;
  }

  const rootDir = path.join(__dirname, '..', 'src');
  const port = Number(process.env.RENDERER_PORT) || 47832;
  const { server, origin } = await createRendererServer(rootDir, port);
  rendererServer = server;
  rendererOrigin = origin;
  console.log('[renderer] UI disponible en', origin);
  return origin;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e24',
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: AUTH_PARTITION,
    },
  });

  Menu.setApplicationMenu(null);

  ensureRendererServer()
    .then((origin) => {
      mainWindow?.loadURL(`${origin}/index.html`);
    })
    .catch((error) => {
      console.error('[renderer] Error al iniciar servidor local:', error);
    });

  if (showDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function generatePdf(event, options = {}) {
  const sender = event.sender;

  let filePath = options.filePath;

  if (!options.returnBuffer && !filePath) {
    const { canceled, filePath: chosenPath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar PDF',
      defaultPath: options.defaultFileName || 'documento.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (canceled || !chosenPath) {
      return { success: false, canceled: true };
    }

    filePath = chosenPath;
  }

  const printOptions = {
    printBackground: true,
    margins: { marginType: 'default' },
    ...options.printOptions,
  };

  const pdfBuffer = await sender.printToPDF(printOptions);

  if (options.returnBuffer) {
    return { success: true, data: pdfBuffer.toString('base64') };
  }

  await fs.writeFile(filePath, pdfBuffer);

  return { success: true, filePath };
}

/**
 * @param {string} base64
 * @returns {Promise<{ success: boolean; canceled?: boolean }>}
 */
async function printPdfFromBuffer(base64) {
  const tempPath = path.join(app.getPath('temp'), `fica-print-${Date.now()}.pdf`);
  await fs.writeFile(tempPath, Buffer.from(base64, 'base64'));

  /** @type {BrowserWindow | null} */
  let printWindow = null;

  try {
    printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
      },
    });

    await printWindow.loadURL(pathToFileURL(tempPath).href);

    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });

    await new Promise((resolve, reject) => {
      if (!printWindow) {
        reject(new Error('No se pudo abrir el visor de impresión'));
        return;
      }

      printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        if (success) {
          resolve(undefined);
          return;
        }

        const reason = String(failureReason ?? '');
        if (/cancel/i.test(reason)) {
          resolve(undefined);
          return;
        }

        reject(new Error(reason || 'No se pudo imprimir el PDF'));
      });
    });

    return { success: true };
  } finally {
    printWindow?.destroy();
    await fs.unlink(tempPath).catch(() => {});
  }
}

/** @type {boolean} */
let isQuitting = false;

app.whenReady().then(() => {
  try {
    initSolicitudesDb(app.getPath('userData'));
  } catch (error) {
    console.error('[sqlite] Error al inicializar base local:', error);
  }
  setupAutoUpdater();
  createWindow();
  checkForUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (isQuitting) {
    closeSolicitudesDb();
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    closeSolicitudesDb();
    return;
  }

  event.preventDefault();

  const finishAppQuit = () => {
    if (isQuitting) return;
    isQuitting = true;
    if (quitTimeout) {
      clearTimeout(quitTimeout);
      quitTimeout = null;
    }
    closeSolicitudesDb();
    rendererServer?.close();
    rendererServer = null;
    rendererOrigin = null;
    app.quit();
  };

  /** @type {NodeJS.Timeout} */
  let quitTimeout = setTimeout(() => {
    console.warn('[sync] Timeout al cerrar; saliendo sin esperar sync');
    finishAppQuit();
  }, 15000);

  ipcMain.once('app:sync-before-quit-done', finishAppQuit);
  mainWindow.webContents.send('app:sync-before-quit');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('auth:google-browser', async () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  return signInWithGoogleBrowser(clientId, clientSecret);
});

ipcMain.handle('app:restart-to-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('pdf:save-buffer', async (_event, { data, defaultFileName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar PDF',
    defaultPath: defaultFileName || 'cotizacion.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) {
    return { success: false, canceled: true };
  }

  await fs.writeFile(filePath, Buffer.from(data, 'base64'));
  return { success: true, filePath };
});

ipcMain.handle('pdf:generate', generatePdf);

ipcMain.handle('pdf:print-buffer', async (_event, base64) => {
  try {
    return await printPdfFromBuffer(base64);
  } catch (error) {
    console.error('[pdf:print-buffer]', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo imprimir el PDF',
    };
  }
});

ipcMain.handle('pdf:save-dialog', async (_event, defaultFileName) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar PDF',
    defaultPath: defaultFileName || 'documento.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  return { canceled, filePath };
});

ipcMain.handle('db:solicitudes:import', (_event, { upserts = [], removedIds = [] }) => {
  importFromFirebase(upserts, removedIds);
  return { success: true };
});

ipcMain.handle('db:solicitudes:update-local', (_event, { id, patch }) => {
  updateSolicitudLocal(id, patch);
  return { success: true };
});

ipcMain.handle('db:solicitudes:delete-soft', (_event, id) => {
  deleteSolicitudLocalSoft(id);
  return { success: true };
});

ipcMain.handle('db:solicitudes:purge', (_event, id) => {
  purgeSolicitudLocal(id);
  return { success: true };
});

ipcMain.handle('db:solicitudes:mark-synced', (_event, { id, data }) => {
  markSolicitudSynced(id, data);
  return { success: true };
});

ipcMain.handle('db:solicitudes:pending-sync', () => ({
  success: true,
  items: listPendingSync(),
}));

ipcMain.handle('db:solicitudes:pending-count', () => ({
  success: true,
  count: countPendingSync(),
}));

ipcMain.handle('db:solicitudes:list-all', () => ({
  success: true,
  items: listAllSolicitudes(),
}));

ipcMain.handle('db:settings:get-all', () => ({
  success: true,
  settings: getAllAppSettings(),
}));

ipcMain.handle('db:settings:set', (_event, { key, value }) => {
  setAppSetting(key, value);
  return { success: true };
});

ipcMain.handle('db:productos:list', () => ({
  success: true,
  items: listProductos(),
}));

ipcMain.handle('db:productos:upsert', (_event, product) => {
  upsertProducto(product);
  return { success: true };
});

ipcMain.handle('db:productos:delete', (_event, id) => {
  deleteProducto(id);
  return { success: true };
});

ipcMain.handle('db:productos:sync-batch', (_event, products) => {
  const count = syncProductosBatch(Array.isArray(products) ? products : []);
  return { success: true, count };
});
