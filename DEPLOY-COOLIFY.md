# Despliegue RedLibertad V1.0 en Coolify

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
- Healthcheck: `/api/health`

## Variables

Copia las variables actuales de AURA, pero revisa estas:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<Postgres URL internal de la base ya migrada>
DATABASE_SSL=false
JWT_SECRET=<tu secreto actual o uno nuevo>
ADMIN_EMAIL=<tu email admin>
APP_ORIGIN=<URL temporal de RedLibertad durante pruebas>
COOKIE_SECURE=false
MEDIA_STORAGE=local
UPLOAD_DIR=/data/uploads
```

Cuando pongas el dominio real con HTTPS:

```env
APP_ORIGIN=https://TU-DOMINIO-REDLIBERTAD
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
