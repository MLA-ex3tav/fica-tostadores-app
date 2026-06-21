/** @type {Array<() => void>} */
const cleanupFns = [];

/**
 * @param {HTMLElement | null} el
 */
function showUpdateStatus(el) {
  if (el) {
    el.classList.add('update-status--visible');
  }
}

/**
 * @param {HTMLElement | null} el
 */
function hideUpdateStatus(el) {
  if (el) {
    el.classList.remove('update-status--visible', 'update-status--ready');
  }
}

export function initUpdateStatus() {
  const container = document.getElementById('update-status');
  const label = document.getElementById('update-label');
  const progressBar = document.getElementById('update-progress-bar');
  const restartBtn = document.getElementById('btn-restart-update');

  if (!window.electronAPI) {
    console.warn('[update-status] electronAPI no disponible (¿ejecutando fuera de Electron?)');
    return;
  }

  const { electronAPI } = window;

  cleanupFns.push(
    electronAPI.onUpdateAvailable((data) => {
      showUpdateStatus(container);
      if (label) {
        label.textContent = `Descargando v${data.version}…`;
      }
    })
  );

  cleanupFns.push(
    electronAPI.onDownloadProgress((data) => {
      showUpdateStatus(container);
      if (progressBar) {
        progressBar.style.width = `${Math.round(data.percent)}%`;
      }
    })
  );

  cleanupFns.push(
    electronAPI.onUpdateDownloaded((data) => {
      showUpdateStatus(container);
      container?.classList.add('update-status--ready');
      if (label) {
        label.textContent = `Actualización v${data.version} lista`;
      }
    })
  );

  cleanupFns.push(
    electronAPI.onUpdateNotAvailable(() => {
      hideUpdateStatus(container);
    })
  );

  cleanupFns.push(
    electronAPI.onUpdateError(() => {
      hideUpdateStatus(container);
    })
  );

  restartBtn?.addEventListener('click', () => {
    electronAPI.restartToUpdate();
  });
}

export function destroyUpdateStatus() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns.length = 0;
  window.electronAPI?.removeUpdateListeners();
}
