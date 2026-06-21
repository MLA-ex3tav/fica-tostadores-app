import { renderLucideIcon, AlertIcons } from './lucide-icons.js';

/** @typedef {'danger' | 'warning' | 'primary' | 'info' | 'success' | 'error'} AlertVariant */

/** @type {HTMLElement | null} */
let dialogRoot = null;

/** @type {HTMLElement | null} */
let toastHost = null;

/** @type {Promise<boolean> | null} */
let activeDialogPromise = null;

/** @type {(() => void) | null} */
let resolveActiveDialog = null;

const ICONS = {
  danger: renderLucideIcon(AlertIcons.danger, { width: 24, height: 24 }),
  warning: renderLucideIcon(AlertIcons.warning, { width: 24, height: 24 }),
  primary: renderLucideIcon(AlertIcons.primary, { width: 24, height: 24 }),
  info: renderLucideIcon(AlertIcons.info, { width: 24, height: 24 }),
  success: renderLucideIcon(AlertIcons.success, { width: 24, height: 24 }),
  error: renderLucideIcon(AlertIcons.error, { width: 24, height: 24 }),
};

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
 * @param {AlertVariant} variant
 * @returns {AlertVariant}
 */
function normalizeDialogVariant(variant) {
  switch (variant) {
    case 'danger':
    case 'warning':
    case 'primary':
    case 'info':
    case 'success':
    case 'error':
      return variant;
    default: {
      const unknown = variant;
      console.warn('[app-alerts] Variante desconocida:', unknown);
      return 'info';
    }
  }
}

/**
 * @param {AlertVariant} variant
 * @returns {'btn--primary' | 'btn--danger'}
 */
function confirmButtonClass(variant) {
  if (variant === 'danger') return 'btn--danger';
  return 'btn--primary';
}

function getDialogElements() {
  if (!dialogRoot) {
    dialogRoot = document.getElementById('app-dialog');
  }
  return {
    root: dialogRoot,
    backdrop: dialogRoot?.querySelector('.app-dialog__backdrop') ?? null,
    panel: dialogRoot?.querySelector('.app-dialog__panel') ?? null,
    icon: dialogRoot?.querySelector('.app-dialog__icon') ?? null,
    title: dialogRoot?.querySelector('.app-dialog__title') ?? null,
    message: dialogRoot?.querySelector('.app-dialog__message') ?? null,
    actions: dialogRoot?.querySelector('.app-dialog__actions') ?? null,
  };
}

function closeDialog(result) {
  const { root } = getDialogElements();
  if (!root) return;

  root.hidden = true;
  document.body.classList.remove('app-dialog-open');

  if (resolveActiveDialog) {
    resolveActiveDialog(result);
    resolveActiveDialog = null;
  }
  activeDialogPromise = null;
}

function bindDialogShell() {
  const { root, backdrop } = getDialogElements();
  if (!root || root.dataset.bound === 'true') return;

  backdrop?.addEventListener('click', () => {
    closeDialog(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || root.hidden) return;
    closeDialog(false);
  });

  root.dataset.bound = 'true';
}

/**
 * @param {{
 *   title: string;
 *   message: string;
 *   confirmLabel?: string;
 *   cancelLabel?: string;
 *   variant?: AlertVariant;
 *   showCancel?: boolean;
 * }} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog(options) {
  if (activeDialogPromise) {
    return activeDialogPromise.then(() => confirmDialog(options));
  }

  const { root, icon, title, message, actions } = getDialogElements();
  if (!root || !icon || !title || !message || !actions) {
    return Promise.resolve(window.confirm(`${options.title}\n\n${options.message}`));
  }

  const variant = normalizeDialogVariant(options.variant ?? 'primary');
  const confirmLabel = options.confirmLabel ?? 'Confirmar';
  const cancelLabel = options.cancelLabel ?? 'Cancelar';
  const showCancel = options.showCancel !== false;

  icon.className = `app-dialog__icon app-dialog__icon--${variant}`;
  icon.innerHTML = ICONS[variant === 'error' ? 'error' : variant] ?? ICONS.info;
  title.textContent = options.title;
  message.textContent = options.message;

  const confirmClass = confirmButtonClass(variant);
  actions.innerHTML = showCancel
    ? `<button class="btn btn--secondary" type="button" data-action="cancel">${escapeHtml(cancelLabel)}</button>
       <button class="btn ${confirmClass}" type="button" data-action="confirm">${escapeHtml(confirmLabel)}</button>`
    : `<button class="btn ${confirmClass}" type="button" data-action="confirm">${escapeHtml(confirmLabel)}</button>`;

  const confirmButton = actions.querySelector('[data-action="confirm"]');
  const cancelButton = actions.querySelector('[data-action="cancel"]');

  confirmButton?.addEventListener('click', () => closeDialog(true), { once: true });
  cancelButton?.addEventListener('click', () => closeDialog(false), { once: true });

  root.hidden = false;
  document.body.classList.add('app-dialog-open');
  confirmButton?.focus();

  activeDialogPromise = new Promise((resolve) => {
    resolveActiveDialog = resolve;
  });

  return activeDialogPromise;
}

/**
 * @param {{
 *   title: string;
 *   message: string;
 *   confirmLabel?: string;
 *   variant?: AlertVariant;
 * }} options
 * @returns {Promise<void>}
 */
export async function alertDialog(options) {
  await confirmDialog({
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Entendido',
    variant: options.variant ?? 'info',
    showCancel: false,
  });
}

/**
 * @param {{
 *   message: string;
 *   variant?: 'success' | 'error' | 'info';
 *   duration?: number;
 * }} options
 */
export function showToast(options) {
  if (!toastHost) {
    toastHost = document.getElementById('app-toast-host');
  }
  if (!toastHost) return;

  const variant = options.variant ?? 'info';
  const duration = options.duration ?? (variant === 'error' ? 6000 : 4000);

  const toast = document.createElement('div');
  toast.className = `app-toast app-toast--${variant}`;
  toast.setAttribute('role', 'status');
  toast.textContent = options.message;

  toastHost.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('app-toast--visible');
  });

  window.setTimeout(() => {
    toast.classList.remove('app-toast--visible');
    window.setTimeout(() => toast.remove(), 180);
  }, duration);
}

export function initAppAlerts() {
  dialogRoot = document.getElementById('app-dialog');
  toastHost = document.getElementById('app-toast-host');
  bindDialogShell();
}
