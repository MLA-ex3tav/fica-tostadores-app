import esbuild from 'esbuild';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

for (const envFile of ['.env', '.env.example']) {
  const envPath = path.join(root, envFile);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const firebaseConfig = {
  apiKey:
    process.env.FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    '',
  authDomain:
    process.env.FIREBASE_AUTH_DOMAIN ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    '',
  projectId:
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    '',
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    '',
  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    '',
  appId:
    process.env.FIREBASE_APP_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    '',
};

await esbuild.build({
  entryPoints: [path.join(root, 'src/renderer.js')],
  bundle: true,
  outfile: path.join(root, 'src/dist/renderer.bundle.js'),
  format: 'esm',
  platform: 'browser',
  define: {
    __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
  },
});

console.log(
  `[build:renderer] Firebase project: ${firebaseConfig.projectId || '(no configurado)'}`
);

const workerSrc = path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const workerDest = path.join(root, 'src', 'dist', 'pdf.worker.min.mjs');
if (fs.existsSync(workerSrc)) {
  fs.copyFileSync(workerSrc, workerDest);
  console.log('[build:renderer] pdf.worker.min.mjs copiado a src/dist/');
}
