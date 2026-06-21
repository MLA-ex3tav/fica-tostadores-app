const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_RENDERER_PORT = 47832;
const RENDERER_HOST = '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
};

/**
 * Sirve el renderer por HTTP en un puerto fijo (origen estable para Firebase Auth).
 * @param {string} rootDir
 * @param {number} [port]
 * @returns {Promise<{ server: import('http').Server; origin: string; port: number }>}
 */
function createRendererServer(rootDir, port = DEFAULT_RENDERER_PORT) {
  const normalizedRoot = path.normalize(rootDir);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${RENDERER_HOST}`);
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/') {
          pathname = '/index.html';
        }

        const filePath = path.normalize(path.join(normalizedRoot, pathname));
        if (!filePath.startsWith(normalizedRoot)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            const status = err.code === 'ENOENT' ? 404 : 500;
            res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(status === 404 ? 'No encontrado' : 'Error interno del servidor');
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
          });
          res.end(data);
        });
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error interno del servidor');
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Puerto ${port} en uso. Cierra la otra instancia de la app o cambia RENDERER_PORT en .env`
          )
        );
        return;
      }
      reject(error);
    });

    server.listen(port, RENDERER_HOST, () => {
      resolve({
        server,
        port,
        origin: `http://${RENDERER_HOST}:${port}`,
      });
    });
  });
}

module.exports = { createRendererServer, DEFAULT_RENDERER_PORT, RENDERER_HOST };
