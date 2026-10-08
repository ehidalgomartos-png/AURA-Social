# Despliegue actual RedLibertad V3.0 — Growth Ready

> Este documento conserva instrucciones históricas de V1.70; para la fase actual utiliza primero [RELEASE-GATE-V3.0.md](RELEASE-GATE-V3.0.md). No crees una nueva aplicación ni cambies de repositorio si el despliegue RedLibertad de Coolify ya funciona.

**Repositorio real:** `ehidalgomartos-png/AURA-Social` · rama `main` · dominio `https://redlibertad.com`.

**Validación V3.0, después de merge y deploy autorizados:**

```bash
npm run gate:config
npm run gate:public -- https://redlibertad.com
```

La primera orden se ejecuta en la instancia donde estén cargadas las variables seguras; la segunda desde un equipo con acceso público. Son pruebas de solo lectura; no sustituyen copias/restauración de PostgreSQL y multimedia, comprobación de Coolify ni pruebas sociales desde móvil. No declarar producción validada por superar GitHub Actions.

---
# Despliegue RedLibertad V1.70 en Coolify

## Estrategia recomendada

No borres AURA todavía. Crea una aplicación nueva **RedLibertad** en el mismo proyecto/servidor, con una URL temporal, y conéctala a la base PostgreSQL que ya migraste de AURA. Como el esquema no cambia, los usuarios, posts, mensajes, likes, comentarios y demás datos se conservan.

## GitHub

1. Crea un repositorio privado `RedLibertad`.
2. Sube **el contenido de esta carpeta** a la raíz del repositorio (`package.json`, `server.js`, `public/`, `src/`, etc.).
3. Da acceso a ese repositorio a la GitHub App de Coolify.

## Coolify

Crea una nueva Application desde el repositorio:

- Branch: `main`
- Build pack: `Railpack`
- Output type: `Web application`
- Port: `3000`
- Base directory: `/`
- Start command: `npm start` (Railpack normalmente lo detecta)
- Healthcheck: `/api/ready`
- Liveness/diagnóstico: `/api/health`

## Variables

Copia las variables actuales de AURA, pero revisa estas:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<Postgres URL internal de la base ya migrada>
DATABASE_SSL=false
JWT_SECRET=<tu secreto actual o uno nuevo>
ADMIN_EMAIL=<tu email admin>
APP_ORIGIN=https://redlibertad.com
COOKIE_SECURE=true
MEDIA_STORAGE=local
UPLOAD_DIR=/data/uploads
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECT_TIMEOUT_MS=5000
```

Cuando pongas el dominio real con HTTPS:

```env
APP_ORIGIN=https://redlibertad.com
COOKIE_SECURE=true
```

## Multimedia local persistente

En **Persistent Storage** de la aplicación crea un volumen con:

- Destination Path: `/data/uploads`

Así las nuevas fotos y vídeos sobreviven a los despliegues. Las URLs antiguas de Bunny que ya estén en la base siguen funcionando durante la transición; se pueden migrar más adelante sin bloquear el lanzamiento.

## Compartir publicaciones

Cada post incluye **Compartir** con:

- compartir nativo del móvil;
- Facebook;
- WhatsApp;
- copiar enlace.

Los enlaces públicos usan `/p/ID` y generan Open Graph con el mensaje **“Mira mi post en RedLibertad”** y **“Donde la libertad es lo primero.”** El contenido sensible no se expone en la vista previa externa.

## Antes de sustituir AURA

Prueba desde móvil: registro, login, feed, posts, subir foto/vídeo, comentarios, borrar comentario, likes, follows, mensajes, Stories, Reels, consentimiento, moderación y compartir. Solo después cambia el dominio definitivo y retira AURA.


## Comprobaciones V1.70 antes de producción

1. Abre `/api/health`: debe responder `ok:true`, `version:"1.70.0"` y `configuration.criticalReady:true`.
2. Abre `/api/ready`: debe responder HTTP 200 con `database:"ready"`.
3. Si `/api/ready` devuelve 503 con `configuration_incomplete`, corrige las variables indicadas antes de publicar.
4. En producción usa HTTPS, `APP_ORIGIN=https://...` y `COOKIE_SECURE=true`.
5. Comprueba que `UPLOAD_DIR` apunta al volumen persistente si `MEDIA_STORAGE=local`.
6. Ejecuta `npm run check:syntax` antes del despliegue.
7. Conserva una copia de seguridad reciente de PostgreSQL y del volumen de multimedia antes de cambios importantes.


## Dominio de producción V1.76

Dominio canónico: `https://redlibertad.com`

- `www.redlibertad.com` debe redirigir a `redlibertad.com`.
- Mantén `APP_ORIGIN=https://redlibertad.com`.
- Mantén `COOKIE_SECURE=true`.
- Comprueba `/robots.txt` y `/sitemap.xml` después de cada cambio relevante de proxy/dominio.
- Los enlaces compartidos deben empezar siempre por `https://redlibertad.com`, incluso si accedes temporalmente por otro hostname.
