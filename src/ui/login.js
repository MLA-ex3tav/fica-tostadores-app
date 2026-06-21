import { createLucideIconElement, StateIcons } from './lucide-icons.js';
import { initFirebase } from '../firebase/init.js';
import { signInWithGoogle, onAuthChanged, signOut } from '../firebase/auth.js';
import {
  ACCESS_DENIED_MESSAGE,
  formatFirestoreError,
  isAccessDeniedError,
} from '../firebase/errors.js';

/** @type {((session: { email: string; displayName: string | null; role: 'admin' | 'editor' }) => void) | null} */
let onAuthenticated = null;

/** @type {(() => void) | null} */
let onSignedOut = null;

/** @type {(() => void) | null} */
let unsubscribeAuth = null;

/** @type {boolean} */
let accessDeniedIconRendered = false;

/**
 * @param {{ user: import('firebase/auth').User; role: 'admin' | 'editor'; email: string; displayName: string | null }} session
 */
function applySession(session) {
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.querySelector('.app-shell');

  showApp(loginScreen, appShell);
  updateUserFooter(session);
  onAuthenticated?.(session);
}

/**
 * @param {boolean} hasSession
 */
function finishAuthCheck(hasSession) {
  const loginChecking = document.getElementById('login-checking');
  const loginBtn = document.getElementById('btn-google-login');

  loginChecking?.classList.remove('login-loading--visible');

  if (!hasSession) {
    loginBtn?.removeAttribute('hidden');
  }
}

function renderAccessDeniedIcon() {
  if (accessDeniedIconRendered) return;

  const iconHost = document.getElementById('login-access-denied-icon');
  if (!iconHost) return;

  const icon = createLucideIconElement(StateIcons.accessDenied, {
    className: 'login-access-denied__icon-svg',
    width: 56,
    height: 56,
    strokeWidth: 1.75,
  });

  iconHost.replaceChildren(icon);
  accessDeniedIconRendered = true;
}

/**
 * @param {string} [message]
 */
function showAccessDenied(message = ACCESS_DENIED_MESSAGE) {
  const loginForm = document.getElementById('login-card-form');
  const accessDenied = document.getElementById('login-access-denied');
  const accessDeniedMessage = document.getElementById('login-access-denied-message');
  const loginError = document.getElementById('login-error');
  const loginLoading = document.getElementById('login-loading');
  const loginChecking = document.getElementById('login-checking');

  loginForm?.setAttribute('hidden', '');
  accessDenied?.removeAttribute('hidden');
  loginChecking?.classList.remove('login-loading--visible');
  loginLoading?.classList.remove('login-loading--visible');

  if (loginError) loginError.textContent = '';
  if (accessDeniedMessage) accessDeniedMessage.textContent = message;

  renderAccessDeniedIcon();
}

function showLoginForm() {
  const loginForm = document.getElementById('login-card-form');
  const accessDenied = document.getElementById('login-access-denied');
  const loginError = document.getElementById('login-error');
  const loginBtn = document.getElementById('btn-google-login');

  accessDenied?.setAttribute('hidden', '');
  loginForm?.removeAttribute('hidden');

  if (loginError) loginError.textContent = '';
  loginBtn?.removeAttribute('hidden');
}

/**
 * @param {unknown} error
 */
function handleLoginError(error) {
  if (isAccessDeniedError(error)) {
    showAccessDenied(formatFirestoreError(error));
    return;
  }

  showLoginForm();
  const loginError = document.getElementById('login-error');
  if (loginError) {
    loginError.textContent = formatFirestoreError(error);
  }
}

/**
 * @param {{ onAuthenticated: (session: { email: string; displayName: string | null; role: 'admin' | 'editor' }) => void; onSignedOut: () => void }} handlers
 */
export function initLogin(handlers) {
  onAuthenticated = handlers.onAuthenticated;
  onSignedOut = handlers.onSignedOut;

  const loginScreen = document.getElementById('login-screen');
  const appShell = document.querySelector('.app-shell');
  const loginBtn = document.getElementById('btn-google-login');
  const loginError = document.getElementById('login-error');
  const loginLoading = document.getElementById('login-loading');
  const retryBtn = document.getElementById('btn-login-retry');

  initFirebase();

  retryBtn?.addEventListener('click', () => {
    showLoginForm();
  });

  loginBtn?.addEventListener('click', async () => {
    if (loginError) loginError.textContent = '';
    loginBtn?.setAttribute('disabled', 'true');
    loginLoading?.classList.add('login-loading--visible');

    try {
      const session = await signInWithGoogle();
      applySession(session);
    } catch (error) {
      handleLoginError(error);
    } finally {
      loginBtn?.removeAttribute('disabled');
      loginLoading?.classList.remove('login-loading--visible');
    }
  });

  unsubscribeAuth = onAuthChanged((session, error) => {
    if (session) {
      applySession(session);
      finishAuthCheck(true);
      return;
    }

    finishAuthCheck(false);
    showLogin(loginScreen, appShell);
    clearUserFooter();
    onSignedOut?.();

    if (error) {
      handleLoginError(error);
    } else {
      showLoginForm();
    }
  });
}

/**
 * @param {HTMLElement | null} loginScreen
 * @param {Element | null} appShell
 */
function showApp(loginScreen, appShell) {
  loginScreen?.classList.add('login-screen--hidden');
  appShell?.classList.remove('app-shell--hidden');
}

/**
 * @param {HTMLElement | null} loginScreen
 * @param {Element | null} appShell
 */
function showLogin(loginScreen, appShell) {
  loginScreen?.classList.remove('login-screen--hidden');
  appShell?.classList.add('app-shell--hidden');
}

/**
 * @param {string | null | undefined} displayName
 * @param {string | null | undefined} email
 * @returns {string}
 */
function getUserInitial(displayName, email) {
  const source = displayName?.trim() || email?.trim() || 'U';
  return source.charAt(0).toUpperCase();
}

/**
 * @param {{ email: string; displayName: string | null; role: 'admin' | 'editor' }} session
 */
export function updateUserFooter(session) {
  const emailEl = document.getElementById('user-email');
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const avatarEl = document.getElementById('user-avatar');

  const displayName =
    session.displayName && session.displayName !== session.email
      ? session.displayName
      : null;

  if (nameEl) {
    nameEl.textContent = displayName ?? session.email?.split('@')[0] ?? 'Usuario';
  }

  if (emailEl) {
    emailEl.textContent = session.email ?? '';
    emailEl.hidden = !session.email;
  }

  if (avatarEl) {
    avatarEl.textContent = getUserInitial(session.displayName, session.email);
  }

  if (roleEl) {
    roleEl.textContent = session.role;
    roleEl.dataset.role = session.role;
  }
}

function clearUserFooter() {
  const emailEl = document.getElementById('user-email');
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const avatarEl = document.getElementById('user-avatar');

  if (emailEl) {
    emailEl.textContent = '';
    emailEl.hidden = true;
  }
  if (nameEl) nameEl.textContent = '';
  if (avatarEl) avatarEl.textContent = '';
  if (roleEl) {
    roleEl.textContent = '';
    delete roleEl.dataset.role;
  }
}

export function initLogoutButton() {
  const logoutBtn = document.getElementById('btn-logout');
  logoutBtn?.addEventListener('click', async () => {
    logoutBtn.setAttribute('disabled', 'true');
    try {
      await signOut();
    } catch (error) {
      console.error('[logout]', error);
    } finally {
      logoutBtn.removeAttribute('disabled');
    }
  });
}

export function destroyLogin() {
  unsubscribeAuth?.();
  unsubscribeAuth = null;
}
