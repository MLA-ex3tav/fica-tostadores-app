import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getAuthInstance, initFirebase } from './init.js';
import { getClientesProfile } from '../services/usuarios.js';
import { ACCESS_DENIED_MESSAGE } from './errors.js';

/** @typedef {'admin' | 'editor'} UserRole */

/** @typedef {{ user: import('firebase/auth').User; role: UserRole; email: string; displayName: string | null }} AuthSession */

/** @type {import('firebase/auth').User | null} */
let currentUser = null;

/** @type {UserRole | null} */
let currentRole = null;

/** @type {string | null} */
let currentEmail = null;

/** @type {string | null} */
let currentDisplayName = null;

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentRole() {
  return currentRole;
}

/**
 * @param {import('firebase/auth').User} user
 * @param {import('../services/usuarios.js').ClientesProfile} profile
 * @returns {AuthSession}
 */
function buildSession(user, profile) {
  currentUser = user;
  currentRole = profile.role;
  currentEmail = user.email ?? profile.email;
  currentDisplayName = user.displayName ?? profile.displayName;

  return {
    user,
    role: profile.role,
    email: currentEmail ?? profile.email ?? 'Usuario',
    displayName: currentDisplayName,
  };
}

function clearSession() {
  currentUser = null;
  currentRole = null;
  currentEmail = null;
  currentDisplayName = null;
}

/**
 * @returns {Promise<AuthSession>}
 */
export async function signInWithGoogle() {
  initFirebase();
  const auth = getAuthInstance();
  if (!auth) {
    throw new Error('Firebase no está configurado');
  }

  if (!window.electronAPI?.signInWithGoogleBrowser) {
    throw new Error('Inicio de sesión con navegador no disponible en este entorno');
  }

  const tokens = await window.electronAPI.signInWithGoogleBrowser();
  const credential = GoogleAuthProvider.credential(tokens.idToken, tokens.accessToken);
  const result = await signInWithCredential(auth, credential);

  const profile = await getClientesProfile(result.user.uid);

  if (!profile) {
    await firebaseSignOut(auth);
    clearSession();
    const err = new Error(ACCESS_DENIED_MESSAGE);
    Object.assign(err, { code: 'auth/unauthorized' });
    throw err;
  }

  return buildSession(result.user, profile);
}

export async function signOut() {
  const auth = getAuthInstance();
  if (auth) {
    await firebaseSignOut(auth);
  }
  clearSession();
}

/**
 * @param {(payload: AuthSession | null, error?: unknown) => void} callback
 * @returns {() => void}
 */
export function onAuthChanged(callback) {
  initFirebase();
  const auth = getAuthInstance();
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      clearSession();
      callback(null);
      return;
    }

    try {
      const profile = await getClientesProfile(user.uid);
      if (!profile) {
        await firebaseSignOut(auth);
        clearSession();
        const err = new Error(ACCESS_DENIED_MESSAGE);
        Object.assign(err, { code: 'auth/unauthorized' });
        callback(null, err);
        return;
      }

      callback(buildSession(user, profile));
    } catch (error) {
      console.error('[auth]', error);
      await firebaseSignOut(auth);
      clearSession();
      callback(null, error);
    }
  });
}
