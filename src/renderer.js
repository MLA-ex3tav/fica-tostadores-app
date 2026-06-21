import { initFirebase } from './firebase/init.js';
import { isFirebaseConfigured } from './firebase/config.js';
import { getCurrentUser } from './firebase/auth.js';
import { subscribeCotizacionesPendientes, subscribeOrdenesTrabajo } from './services/cotizaciones.js';
import { formatFirestoreError } from './firebase/errors.js';
import { loadAppSettings } from './services/app-settings.js';
import { initSidebar, onNavigate, navigateTo } from './ui/sidebar.js';
import {
  initCotizacionesView,
  renderCotizaciones,
  showError,
  showLoading,
} from './ui/cotizaciones-view.js';
import { initOTView, renderOrdenesTrabajo, showOTError, showOTLoading, closeOrdenTrabajoDetail } from './ui/ot-view.js';
import {
  initHistorialView,
  startHistorialListener,
  stopHistorialListener,
  closeHistorialDetail,
} from './ui/historial-view.js';
import {
  initClientesView,
  startClientesListener,
  stopClientesListener,
  closeClientesDetail,
} from './ui/clientes-view.js';
import { initClienteDetail } from './ui/cliente-detail.js';
import {
  initReportesView,
  startReportesListener,
  stopReportesListener,
} from './ui/reportes-view.js';
import { initProductosView, renderProductosView } from './ui/productos-view.js';
import { initUpdateStatus, destroyUpdateStatus } from './ui/update-status.js';
import { initLogin, initLogoutButton, destroyLogin } from './ui/login.js';
import { initPdfPreview } from './ui/pdf-preview.js';
import { initAppAlerts } from './ui/app-alerts.js';
import { initAppModal, closeAppModal } from './ui/app-modal.js';
import { initAutoFirebaseSync, startAutoFirebaseSync, destroyAutoFirebaseSync } from './ui/sync-firebase.js';
import { startAutoProductosSync, destroyAutoProductosSync } from './ui/sync-productos.js';

/** @type {(() => void) | null} */
let unsubscribeCotizaciones = null;

/** @type {(() => void) | null} */
let unsubscribeOT = null;

/** @type {boolean} */
let appInitialized = false;

/** Vistas que usan el modal compartido (#app-detail-modal). */
const MODAL_VIEWS = new Set(['clientes', 'historial', 'productos']);

function initAppShell() {
  if (appInitialized) return;
  appInitialized = true;

  initSidebar();
  initOTView();
  initCotizacionesView();
  initHistorialView();
  initClientesView();
  initClienteDetail();
  initReportesView();
  initProductosView();
  initUpdateStatus();
  initLogoutButton();
  initPdfPreview();
  initAppAlerts();
  initAppModal();
  initAutoFirebaseSync();

  onNavigate(handleViewChange);
  navigateTo('cotizaciones');
}

function ensureAuthenticated() {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Debes iniciar sesión para acceder a esta sección.');
  }
  initFirebase();
}

async function startCotizacionesListener() {
  if (unsubscribeCotizaciones) return;

  showLoading();

  try {
    ensureAuthenticated();
  } catch (error) {
    console.error('[auth]', error);
    showError(formatFirestoreError(error), { persistent: true });
    return;
  }

  const unsubscribe = subscribeCotizacionesPendientes(
    (items) => {
      renderCotizaciones(items);
    },
    (error) => {
      console.error('[Firestore]', error);
      showError(formatFirestoreError(error), { persistent: true });
    }
  );

  if (unsubscribe) {
    unsubscribeCotizaciones = unsubscribe;
  }
}

function stopCotizacionesListener() {
  if (unsubscribeCotizaciones) {
    unsubscribeCotizaciones();
    unsubscribeCotizaciones = null;
  }
}

async function startOTListener() {
  if (unsubscribeOT) return;

  showOTLoading();

  try {
    ensureAuthenticated();
  } catch (error) {
    console.error('[auth]', error);
    showOTError(formatFirestoreError(error), { persistent: true });
    return;
  }

  const unsubscribe = subscribeOrdenesTrabajo(
    (items) => {
      renderOrdenesTrabajo(items);
    },
    (error) => {
      console.error('[Firestore OT]', error);
      showOTError(formatFirestoreError(error), { persistent: true });
    }
  );

  if (unsubscribe) {
    unsubscribeOT = unsubscribe;
  }
}

function stopOTListener() {
  if (unsubscribeOT) {
    unsubscribeOT();
    unsubscribeOT = null;
  }
}

function handleViewChange(viewId) {
  if (viewId !== 'ot') {
    closeOrdenTrabajoDetail();
  }
  if (viewId !== 'historial') {
    closeHistorialDetail();
  }
  if (viewId !== 'clientes') {
    closeClientesDetail();
  }
  if (!MODAL_VIEWS.has(viewId)) {
    closeAppModal();
  }

  if (viewId === 'cotizaciones' && !unsubscribeCotizaciones) {
    startCotizacionesListener();
  }

  if (viewId === 'ot' && !unsubscribeOT) {
    startOTListener();
  }

  if (viewId === 'historial') {
    startHistorialListener();
  } else {
    stopHistorialListener();
  }

  if (viewId === 'clientes') {
    startClientesListener();
  } else {
    stopClientesListener();
  }

  if (viewId === 'reportes') {
    startReportesListener();
  } else {
    stopReportesListener();
  }

  if (viewId === 'productos') {
    renderProductosView();
  }
}

function init() {
  initFirebase();

  if (isFirebaseConfigured()) {
    startAutoProductosSync();
  }

  initLogin({
    onAuthenticated: () => {
      void loadAppSettings();
      initAppShell();
      startCotizacionesListener();
      startOTListener();
      startAutoFirebaseSync();
      startAutoProductosSync();
    },
    onSignedOut: () => {
      stopCotizacionesListener();
      stopOTListener();
      stopHistorialListener();
      stopClientesListener();
      stopReportesListener();
      destroyAutoFirebaseSync();
      destroyAutoProductosSync();
    },
  });

  window.addEventListener('beforeunload', () => {
    stopCotizacionesListener();
    stopOTListener();
    stopHistorialListener();
    stopClientesListener();
    stopReportesListener();
    destroyAutoFirebaseSync();
    destroyAutoProductosSync();
    destroyUpdateStatus();
    destroyLogin();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
