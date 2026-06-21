const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { shell } = require('electron');

const OAUTH_HOST = '127.0.0.1';
const OAUTH_PORT = 42813;
const OAUTH_REDIRECT_PATH = '/auth/callback';
const OAUTH_REDIRECT_URI = `http://${OAUTH_HOST}:${OAUTH_PORT}${OAUTH_REDIRECT_PATH}`;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * @returns {{ verifier: string; challenge: string }}
 */
function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * @param {string} body
 * @param {string} contentType
 * @returns {Promise<Record<string, unknown>>}
 */
function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Respuesta inválida de Google OAuth'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * @param {import('http').ServerResponse} res
 * @param {string} title
 * @param {string} message
 * @param {boolean} success
 */
function sendHtmlResponse(res, title, message, success) {
  const color = success ? '#ff6b00' : '#ff6b6b';
  res.writeHead(success ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Segoe UI,sans-serif;background:#1e1e24;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;max-width:420px;padding:24px;">
    <h1 style="color:${color};">${title}</h1>
    <p style="color:#c8c4bc;line-height:1.5;">${message}</p>
  </div>
</body>
</html>`);
}

/**
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<{ idToken: string; accessToken: string }>}
 */
function signInWithGoogleBrowser(clientId, clientSecret) {
  if (!clientId) {
    return Promise.reject(
      new Error('Falta GOOGLE_OAUTH_CLIENT_ID en .env (Firebase → Authentication → Google → Web client ID)')
    );
  }

  if (!clientSecret) {
    return Promise.reject(
      new Error(
        'Falta GOOGLE_OAUTH_CLIENT_SECRET en .env (Google Cloud → Credentials → Web client → Client secret)'
      )
    );
  }

  const { verifier, challenge } = createPkcePair();

  return new Promise((resolve, reject) => {
    /** @type {import('http').Server | null} */
    let server = null;
    /** @type {NodeJS.Timeout | null} */
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    };

    const fail = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    timeoutId = setTimeout(() => {
      fail(new Error('Tiempo de espera agotado. Vuelve a intentar el inicio de sesión.'));
    }, OAUTH_TIMEOUT_MS);

    server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith(OAUTH_REDIRECT_PATH)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No encontrado');
        return;
      }

      try {
        const requestUrl = new URL(req.url, `http://${OAUTH_HOST}:${OAUTH_PORT}`);
        const error = requestUrl.searchParams.get('error');
        if (error) {
          sendHtmlResponse(res, 'Inicio de sesión cancelado', 'Puedes cerrar esta pestaña y volver a la app.', false);
          fail(new Error(`Google OAuth: ${error}`));
          return;
        }

        const code = requestUrl.searchParams.get('code');
        if (!code) {
          sendHtmlResponse(res, 'Error', 'No se recibió código de autorización.', false);
          fail(new Error('No se recibió código de autorización de Google'));
          return;
        }

        const tokenBody = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: OAUTH_REDIRECT_URI,
        }).toString();

        const tokenResponse = await postForm('https://oauth2.googleapis.com/token', tokenBody);

        if (tokenResponse.error) {
          sendHtmlResponse(
            res,
            'Error',
            'No se pudo completar el inicio de sesión. Vuelve a la app e intenta de nuevo.',
            false
          );
          fail(new Error(String(tokenResponse.error_description || tokenResponse.error)));
          return;
        }

        const idToken = tokenResponse.id_token;
        const accessToken = tokenResponse.access_token;

        if (!idToken || !accessToken) {
          sendHtmlResponse(res, 'Error', 'Google no devolvió tokens válidos.', false);
          fail(new Error('Google no devolvió id_token o access_token'));
          return;
        }

        sendHtmlResponse(
          res,
          '¡Listo!',
          'Inicio de sesión exitoso. Puedes cerrar esta pestaña y volver a Fica Tostadores.',
          true
        );

        cleanup();
        resolve({
          idToken: String(idToken),
          accessToken: String(accessToken),
        });
      } catch (error) {
        sendHtmlResponse(res, 'Error', 'Ocurrió un error al iniciar sesión.', false);
        fail(error);
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        fail(new Error(`Puerto OAuth ${OAUTH_PORT} en uso. Cierra otras instancias de la app.`));
        return;
      }
      fail(error);
    });

    server.listen(OAUTH_PORT, OAUTH_HOST, () => {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid email profile');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'select_account');

      shell.openExternal(authUrl.toString()).catch(fail);
    });
  });
}

module.exports = {
  signInWithGoogleBrowser,
  OAUTH_REDIRECT_URI,
  OAUTH_PORT,
};
