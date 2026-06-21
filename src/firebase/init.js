import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './config.js';

/** @type {import('firebase/app').FirebaseApp | null} */
let app = null;

/** @type {import('firebase/auth').Auth | null} */
let auth = null;

/** @type {import('firebase/firestore').Firestore | null} */
let db = null;

export function initFirebase() {
  if (!isFirebaseConfigured()) {
    console.warn('[Firebase] Configuración pendiente. Revisar .env');
    return null;
  }

  if (app) {
    return { app, auth, db };
  }

  app = initializeApp(firebaseConfig);

  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'auth/already-initialized'
    ) {
      auth = getAuth(app);
    } else {
      throw error;
    }
  }

  db = getFirestore(app);

  return { app, auth, db };
}

export function getAuthInstance() {
  return auth;
}

export function getDb() {
  return db;
}
