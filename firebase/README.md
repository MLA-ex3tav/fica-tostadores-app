# Firebase — referencia local

## Reglas

Publicar [`firestore.rules`](firestore.rules) en Firebase Console → Firestore → Reglas.

## Snapshot del catálogo (para Cursor / revisión)

La app Electron **lee** Firestore en tiempo real al sincronizar. Para que el agente de Cursor pueda ver qué hay en la base **sin credenciales de escritura**, exporta un snapshot JSON:

```bash
npm run firestore:inspect
```

Genera [`snapshots/catalog-snapshot.json`](snapshots/catalog-snapshot.json) con:

- Colección **`productos`** (lectura pública)
- Colección **`catalogo_config`** (lectura pública)

**No incluye** `solicitudes_cotizacion` ni `clientes` (requieren login staff).

### Cuándo refrescar

Ejecuta `npm run firestore:inspect` después de cambiar productos en Firebase y dime en el chat que lo corriste (o commitea el snapshot si querés historial).

### Otras formas de compartir datos con el agente

1. **Consola Firebase** → Firestore → exportar documento / captura de pantalla.
2. **Pegar JSON** de un producto concreto en el chat.
3. **Service Account** (solo si hace falta export staff): descargar JSON de Firebase Console → Project settings → Service accounts. **No lo subas al repo ni lo pegues en el chat**; úsalo solo en scripts locales.

## Estructura esperada de productos

Cada doc en `productos/{id}`:

```json
{
  "name": "TLC 700 G",
  "listPrice": 1200000,
  "category": "cafe",
  "capacity": "700 g",
  "description": "...",
  "images": [{ "url": "https://...", "role": "main" }],
  "features": ["..."],
  "technicalDetails": [{ "label": "...", "value": "..." }]
}
```

Imágenes: archivos en **Firebase Storage**, URLs en el campo `images` del documento.
