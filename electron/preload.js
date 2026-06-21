const { contextBridge, ipcRenderer } = require('electron');

const UPDATE_CHANNELS = [
  'update-available',
  'download-progress',
  'update-downloaded',
  'update-not-available',
  'update-error',
];

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateAvailable: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  onUpdateDownloaded: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  onUpdateNotAvailable: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
  },

  onUpdateError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },

  restartToUpdate: () => ipcRenderer.invoke('app:restart-to-update'),

  generatePdf: (options) => ipcRenderer.invoke('pdf:generate', options),

  savePdfBuffer: (data, defaultFileName) =>
    ipcRenderer.invoke('pdf:save-buffer', { data, defaultFileName }),

  printPdfBuffer: (data) => ipcRenderer.invoke('pdf:print-buffer', data),

  showSavePdfDialog: (defaultFileName) =>
    ipcRenderer.invoke('pdf:save-dialog', defaultFileName),

  signInWithGoogleBrowser: () => ipcRenderer.invoke('auth:google-browser'),

  importFromFirebaseLocal: (payload) => ipcRenderer.invoke('db:solicitudes:import', payload),

  updateSolicitudLocal: (payload) => ipcRenderer.invoke('db:solicitudes:update-local', payload),

  deleteSolicitudLocalSoft: (id) => ipcRenderer.invoke('db:solicitudes:delete-soft', id),

  purgeSolicitudLocal: (id) => ipcRenderer.invoke('db:solicitudes:purge', id),

  markSolicitudSyncedLocal: (payload) => ipcRenderer.invoke('db:solicitudes:mark-synced', payload),

  listPendingSyncLocal: () => ipcRenderer.invoke('db:solicitudes:pending-sync'),

  countPendingSyncLocal: () => ipcRenderer.invoke('db:solicitudes:pending-count'),

  listAllSolicitudesLocal: () => ipcRenderer.invoke('db:solicitudes:list-all'),

  getAllAppSettingsLocal: () => ipcRenderer.invoke('db:settings:get-all'),

  setAppSettingLocal: (key, value) => ipcRenderer.invoke('db:settings:set', { key, value }),

  listProductosLocal: () => ipcRenderer.invoke('db:productos:list'),

  upsertProductoLocal: (product) => ipcRenderer.invoke('db:productos:upsert', product),

  deleteProductoLocal: (id) => ipcRenderer.invoke('db:productos:delete', id),

  syncProductosBatchLocal: (products) =>
    ipcRenderer.invoke('db:productos:sync-batch', products),

  onSyncBeforeQuit: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:sync-before-quit', handler);
    return () => ipcRenderer.removeListener('app:sync-before-quit', handler);
  },

  notifySyncBeforeQuitDone: () => ipcRenderer.send('app:sync-before-quit-done'),

  removeUpdateListeners: () => {
    UPDATE_CHANNELS.forEach((channel) => {
      ipcRenderer.removeAllListeners(channel);
    });
  },
});
