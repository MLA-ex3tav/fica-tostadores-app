import { DEFAULT_ETAPAS_PRODUCCION } from './produccion.js';

/** @typedef {{
 *   empresaNombre?: string;
 *   empresaEmail?: string;
 *   etapasProduccion?: Array<{ id: string; label: string }>;
 *   productosLastSyncAt?: string | null;
 *   catalogoConfig?: {
 *     categories?: Array<{ id: string; label: string; catalogId?: string; description?: string }>;
 *     catalogs?: Array<{ id: string; label: string }>;
 *   } | null;
 * }} AppSettings
 */

export const DEFAULT_APP_SETTINGS = {
  empresaNombre: 'FICA TOSTADORES',
  empresaEmail: 'ADMINISTRACION@TOSTADORESFICA.CL',
  etapasProduccion: null,
};

/** @type {AppSettings | null} */
let cachedSettings = null;

export function isAppSettingsAvailable() {
  return Boolean(window.electronAPI?.getAllAppSettingsLocal);
}

/**
 * @returns {Promise<AppSettings>}
 */
export async function loadAppSettings() {
  if (!isAppSettingsAvailable()) {
    cachedSettings = { ...DEFAULT_APP_SETTINGS };
    return cachedSettings;
  }

  const result = await window.electronAPI.getAllAppSettingsLocal();
  cachedSettings = {
    ...DEFAULT_APP_SETTINGS,
    ...(result.settings ?? {}),
  };
  return cachedSettings;
}

/**
 * @returns {AppSettings}
 */
export function getCachedAppSettings() {
  return cachedSettings ?? { ...DEFAULT_APP_SETTINGS };
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function setAppSetting(key, value) {
  if (!isAppSettingsAvailable()) {
    throw new Error('Configuración local no disponible');
  }
  await window.electronAPI.setAppSettingLocal(key, value);
  cachedSettings = {
    ...getCachedAppSettings(),
    [key]: value,
  };
}

/**
 * @returns {Promise<Array<{ id: string; label: string }>>}
 */
export async function getEtapasProduccion() {
  const settings = cachedSettings ?? (await loadAppSettings());
  if (Array.isArray(settings.etapasProduccion) && settings.etapasProduccion.length > 0) {
    return settings.etapasProduccion;
  }
  return DEFAULT_ETAPAS_PRODUCCION;
}
