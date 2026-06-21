/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAccessDeniedError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if ('code' in error && error.code === 'auth/unauthorized') {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Sin permisos') || message.includes('no tiene rol admin o editor');
}

export const ACCESS_DENIED_MESSAGE =
  'Tu cuenta no tiene permisos de administración. Contacta al administrador para solicitar acceso con rol admin o editor.';

/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatFirestoreError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';

  if (code === 'auth/argument-error') {
    return 'Error de configuración de autenticación. Reinicia la app e intenta de nuevo.';
  }

  if (code === 'auth/unauthorized') {
    return ACCESS_DENIED_MESSAGE;
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Inicio de sesión cancelado.';
  }

  if (code === 'auth/popup-blocked') {
    return 'El popup de Google fue bloqueado. Permite ventanas emergentes para esta app.';
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Google Sign-In desactivado. Activarlo en Firebase Console → Authentication → Sign-in method → Google.';
  }

  if (code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
    return [
      'Permisos insuficientes en Firestore.',
      'Verifica que exista clientes/{tu-uid} con role admin o editor.',
      'Las solicitudes se leen de solicitudes_cotizacion (solo personal autorizado). Para eliminar, despliega las reglas actualizadas en Firebase Console.',
    ].join(' ');
  }

  if (message.includes('index') || code === 'failed-precondition') {
    return `${message} — Crear el índice compuesto en Firebase Console (estado + createdAt).`;
  }

  return message;
}
