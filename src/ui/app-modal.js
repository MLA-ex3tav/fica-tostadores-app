/** @type {HTMLElement | null} */
let modalRoot = null;

/** @type {HTMLElement | null} */
let modalBody = null;

/** @type {(() => void) | null} */
let onCloseCallback = null;

function getModalElements() {
  if (!modalRoot) {
    modalRoot = document.getElementById('app-detail-modal');
    modalBody = document.getElementById('app-detail-modal-body');
  }
  return { root: modalRoot, body: modalBody };
}

function bindModalShell() {
  const { root } = getModalElements();
  if (!root || root.dataset.bound === 'true') return;

  root.querySelector('.app-modal__backdrop')?.addEventListener('click', () => {
    closeAppModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isAppModalOpen()) return;
    closeAppModal();
  });

  root.dataset.bound = 'true';
}

/**
 * @param {{ onClose?: () => void }} [callbacks]
 * @returns {HTMLElement}
 */
export function openAppModal(callbacks = {}) {
  const { root, body } = getModalElements();
  if (!root || !body) {
    throw new Error('Modal de detalle no disponible');
  }

  onCloseCallback = callbacks.onClose ?? null;
  body.innerHTML = '';
  root.hidden = false;
  document.body.classList.add('app-modal-open');

  return body;
}

export function closeAppModal() {
  const { root, body } = getModalElements();
  if (!root) return;

  root.hidden = true;
  if (body) {
    body.innerHTML = '';
  }
  document.body.classList.remove('app-modal-open');

  const callback = onCloseCallback;
  onCloseCallback = null;
  callback?.();
}

export function isAppModalOpen() {
  const { root } = getModalElements();
  return root != null && !root.hidden;
}

/**
 * @returns {HTMLElement | null}
 */
export function getAppModalBody() {
  const { body } = getModalElements();
  return body;
}

export function initAppModal() {
  getModalElements();
  bindModalShell();
}
