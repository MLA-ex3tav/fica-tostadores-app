/**
 * Configuración pública de Firebase (inyectada en build desde .env).
 * @see https://console.firebase.google.com/
 */
export const firebaseConfig =
  typeof __FIREBASE_CONFIG__ !== 'undefined'
    ? __FIREBASE_CONFIG__
    : {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
      };

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}
