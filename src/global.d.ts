/**
 * Tipos globales expuestos por preload.js
 * @typedef {Object} ElectronAPI
 * @property {(callback: (data: { version: string }) => void) => () => void} onUpdateAvailable
 * @property {(callback: (data: { percent: number; transferred: number; total: number }) => void) => () => void} onDownloadProgress
 * @property {(callback: (data: { version: string }) => void) => () => void} onUpdateDownloaded
 * @property {(callback: (data: Record<string, never>) => void) => () => void} onUpdateNotAvailable
 * @property {(callback: (data: { message: string }) => void) => () => void} onUpdateError
 * @property {() => Promise<void>} restartToUpdate
 * @property {(options?: Record<string, unknown>) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; data?: string }>} generatePdf
 * @property {(data: string, defaultFileName?: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>} savePdfBuffer
 * @property {(defaultFileName?: string) => Promise<{ canceled: boolean; filePath?: string }>} showSavePdfDialog
 * @property {() => Promise<{ idToken: string; accessToken: string }>} signInWithGoogleBrowser
 * @property {() => void} removeUpdateListeners
 */

/** @type {Window & { electronAPI?: ElectronAPI }} */
// eslint-disable-next-line no-unused-vars
const _window = window;
