import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '../firebase/init.js';

/** @typedef {'admin' | 'editor'} UserRole */

/** @typedef {{ role: UserRole; email: string | null; displayName: string | null }} ClientesProfile */

const CLIENTES_COLLECTION = 'clientes';

/**
 * @param {import('firebase/firestore').DocumentData} data
 * @returns {UserRole | null}
 */
function parseStaffRole(data) {
  const role = data.role;
  switch (role) {
    case 'admin':
    case 'editor':
      return role;
    default:
      return null;
  }
}

/**
 * @param {string} uid
 * @returns {Promise<ClientesProfile | null>}
 */
export async function getClientesProfile(uid) {
  const db = getDb();
  if (!db) {
    throw new Error('Firebase no está configurado');
  }

  const snap = await getDoc(doc(db, CLIENTES_COLLECTION, uid));
  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  const role = parseStaffRole(data);
  if (!role) {
    return null;
  }

  return {
    role,
    email: typeof data.email === 'string' ? data.email : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
  };
}

/**
 * @param {string} uid
 * @returns {Promise<UserRole | null>}
 */
export async function getUsuarioRole(uid) {
  const profile = await getClientesProfile(uid);
  return profile?.role ?? null;
}

/**
 * @param {unknown} role
 * @returns {role is UserRole}
 */
export function isStaffRole(role) {
  return role === 'admin' || role === 'editor';
}

/**
 * @param {import('firebase/auth').User | null | undefined} user
 * @param {ClientesProfile | null | undefined} profile
 * @returns {string}
 */
export function resolveUserLabel(user, profile) {
  return (
    user?.email ??
    profile?.email ??
    user?.displayName ??
    profile?.displayName ??
    'Usuario'
  );
}
