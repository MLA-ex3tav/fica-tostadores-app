# Fica Tostadores — App de Escritorio

Aplicación Electron para la administración de Fica Tostadores: cotizaciones en tiempo real (Firestore), órdenes de trabajo y auto-actualización vía GitHub Releases.

## Requisitos

- Node.js 18+
- Cuenta Firebase con Firestore habilitado
- Repositorio GitHub para releases (auto-update)

## Instalación

```bash
npm install
```

## Configuración Firebase

1. Copiar `.env.example` a `.env` con las credenciales del proyecto (o usar `.env.example` directamente en desarrollo).
2. **Authentication → Sign-in method → Google → Activar** (desactivar Anónimo si estaba activo).
3. Las reglas de Firestore están en Firebase Console (colección `clientes` + `solicitudes_cotizacion`). Referencia local: [`firebase/firestore.rules`](firebase/firestore.rules).
4. El usuario autorizado debe existir en **Firestore → colección `clientes`**, documento `{uid}`:

```json
{
  "email": "tu@gmail.com",
  "uid": "vRxfOU3ZYmXvj29GVBqobpGkvcA2",
  "role": "admin",
  "displayName": "Tu nombre"
}
```

Roles válidos para la app de escritorio: `admin` | `editor`

5. Las solicitudes de la web están en **`solicitudes_cotizacion`**. La web envía contacto + productos + envío opcional + UID (si hay sesión Google); el servidor calcula precios y guarda todo ahí. El perfil guardado (`shippingProfile`) vive aparte en **`clientes/{uid}`** y no se mezcla con la cotización.

```json
{
  "clientUid": "abc123",
  "contact": {
    "name": "Dario Gustavo Ezequiel Muñoz Navarrete",
    "email": "contacto@ejemplo.com",
    "phone": "+569..."
  },
  "products": [
    {
      "id": "tostador-50",
      "name": "Tostador industrial 50kg",
      "quantity": 1,
      "unitPrice": 1200000,
      "lineTotal": 1200000
    }
  ],
  "shipping": {
    "enabled": true,
    "cost": 40000,
    "address": {
      "addressLine1": "Mac iver 1531",
      "addressLine2": "Casa",
      "city": "Padre las casas",
      "region": "Araucanía",
      "postalCode": "4850000",
      "country": "Chile"
    }
  },
  "shippingProfile": {
    "contactName": "Dario Gustavo Ezequiel Muñoz Navarrete",
    "email": "esoldar2006@gmail.com",
    "phone": "+56949959571",
    "addressLine1": "Mac iver 1531",
    "city": "Padre las casas",
    "region": "Araucanía",
    "postalCode": "4850000",
    "country": "Chile"
  },
  "pricing": {
    "subtotal": 1200000,
    "shipping": 40000,
    "total": 1240000
  },
  "createdAt": "<Firestore Timestamp>"
}
```

Estados: `pendiente` | `en_cotizacion` | `aprobada_ot` | `completada` | `rechazada`

Formato legacy (solicitudes antiguas sin `contact`/`pricing` anidados): `clientName`, `clientEmail`, `clientPhone`, `products`, `precioFinal`, `envio`, `precioTotal`.

La app **no** lee `clientes/{uid}.shippingProfile` al armar la cotización; solo usa lo embebido en cada documento de `solicitudes_cotizacion`.

### Índice compuesto requerido

| Colección               | Campo 1   | Campo 2     |
|-------------------------|-----------|-------------|
| solicitudes_cotizacion  | estado ↑  | createdAt ↓ |

Firebase Console mostrará un enlace para crearlo al ejecutar la app por primera vez.
## Autenticación

La app muestra pantalla de **Continuar con Google** al iniciar. El inicio de sesión se abre en **tu navegador del sistema** (Chrome, Edge, etc.), así puedes elegir una cuenta que ya tenga sesión iniciada. Solo entran usuarios con documento en **`clientes/{uid}`** y `role` igual a `admin` o `editor`.

### Configurar Google OAuth (obligatorio)

1. **Firebase → Authentication → Google → Activar**  
   [https://console.firebase.google.com/project/fica-tostadores/authentication/providers](https://console.firebase.google.com/project/fica-tostadores/authentication/providers)

2. Copia el **Web client ID** y el **Client secret** en `.env` (Google Cloud → Credentials → Web client):
   ```env
   GOOGLE_OAUTH_CLIENT_ID=730909202093-xxxxxxxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxx
   ```

3. **Google Cloud → Credentials → OAuth 2.0 Client IDs → Web client** (el que crea Firebase)  
   [https://console.cloud.google.com/apis/credentials?project=fica-tostadores](https://console.cloud.google.com/apis/credentials?project=fica-tostadores)

   Agrega esta **Authorized redirect URI**:
   ```
   http://127.0.0.1:42813/auth/callback
   ```

   (Opcional) **Authorized JavaScript origin**:
   ```
   http://127.0.0.1:42813
   ```

4. **Firebase → Authentication → Settings → Authorized domains**  
   [https://console.firebase.google.com/project/fica-tostadores/authentication/settings](https://console.firebase.google.com/project/fica-tostadores/authentication/settings)

   Verifica que estén **`localhost`** y **`127.0.0.1`**.

### Sesión persistente

La UI se sirve siempre en **`http://127.0.0.1:47832`** (puerto fijo). Firebase Auth guarda la sesión por origen; con puerto estable, al reiniciar la app entras directo sin volver a Google (salvo que uses **Cerrar sesión**).

Verifica que **localhost** esté en Firebase Console → Authentication → Settings → Authorized domains.

Si el puerto 47832 está ocupado, cierra la otra instancia o define `RENDERER_PORT=47833` en `.env`.

Si ves *"Acceso denegado"* → agregar o corregir el documento en **`clientes/{uid}`** (no `usuarios`).

Si ves *"Missing or insufficient permissions"* → verificar que tu rol sea admin/editor en `clientes` y que las reglas permitan leer `solicitudes_cotizacion`.
## Desarrollo

```bash
npm install
npm start
```

`npm start` compila el renderer con esbuild (necesario para resolver imports de Firebase) y luego abre Electron.

Para recompilar solo el renderer:

```bash
npm run build:renderer
```

La app abre en **1200×800** sin barra de menú nativa. En desarrollo el auto-updater está deshabilitado.

## Build y releases (GitHub)

Repositorio: [github.com/MLA-ex3tav/fica-tostadores-app](https://github.com/MLA-ex3tav/fica-tostadores-app)

### 1. Instalador local (sin publicar)

```bash
npm run build:win
```

Genera el instalador NSIS en `dist/`. Útil para probar la app empaquetada antes de subir un release.

### 2. Publicar release con auto-update

1. Incrementar `version` en [`package.json`](package.json) (ej. `1.0.0` → `1.0.1`).
2. Tener un token de GitHub con permiso `repo` (la CLI `gh` ya lo incluye si iniciaste sesión):

```bash
# Windows PowerShell — usa el token de gh auth
$env:GH_TOKEN = gh auth token
npm run publish:win
```

Esto compila, crea un **GitHub Release** y sube el instalador + `latest.yml`. La app instalada detecta la nueva versión al iniciar (`electron-updater`).

### 3. Probar actualizaciones

1. Instalar la versión **1.0.0** desde el release (o desde `dist/`).
2. Publicar **1.0.1** con el paso anterior.
3. Abrir la app 1.0.0: en el sidebar aparece la descarga y el botón **Reiniciar para actualizar**.

En desarrollo (`npm start`) el auto-updater está deshabilitado a propósito.

## Estructura del proyecto

```
electron/          → main.js, preload.js (proceso principal seguro)
src/
  index.html       → Shell UI
  renderer.js      → Orquestador del renderer
  firebase/        → Config, auth Google, init Firestore
  services/        → Cotizaciones, usuarios, PDF
  ui/              → Inicio de sesión, sidebar, vistas, estado de actualizaciones
  styles/app.css   → Paleta industrial oscura
assets/            → Icono de la app
```

## Seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- API expuesta al renderer solo vía `preload.js` (`window.electronAPI`)
- Firebase Web SDK en renderer; proteger datos con reglas Firestore

## API IPC disponible

| Canal | Descripción |
|-------|-------------|
| `update-available` | Nueva versión detectada |
| `download-progress` | Progreso de descarga |
| `update-downloaded` | Listo para reiniciar |
| `auth:google-browser` | Abre Google en el navegador del sistema y devuelve tokens |
| `app:restart-to-update` | Instala y reinicia |
| `pdf:generate` | Genera PDF con `printToPDF()` |

Uso de PDF desde el renderer:

```javascript
import { exportActiveViewAsPdf } from './services/pdf.js';
await exportActiveViewAsPdf('cotizacion.pdf');
```
