# RedLibertad V1.0.0 — Rebranding + Mobile First

RedLibertad nace sobre la base funcional de AURA V0.4.3, conservando usuarios, perfiles, feed, follows, likes, comentarios, borrado de comentarios, Stories, Reels, mensajería, notificaciones, intereses, consentimiento, contenido sensible, denuncias, moderación, PWA y PostgreSQL.

**Slogan:** “Donde la libertad es lo primero.”

## Novedades V1.0

- Rebranding completo AURA → RedLibertad.
- Identidad azul marino + coral + turquesa + marfil.
- Logo R + burbuja de conversación + gesto de libertad.
- Portada nueva diseñada primero para móvil.
- Navegación y feed optimizados para pantallas pequeñas, safe areas y controles táctiles.
- Compartir publicaciones desde el feed.
- Web Share API en móviles.
- Compartir en Facebook, WhatsApp y copiar enlace.
- Enlace público por publicación: `/p/:id`.
- Open Graph para que Facebook muestre “Mira mi post en RedLibertad” + “Donde la libertad es lo primero”.
- El contenido sensible no se expone en las previsualizaciones externas.
- PWA renombrada con iconos RedLibertad.
- Healthcheck `/api/health`, versión 1.0.0.
- `upgradeInsecureRequests` desactivado temporalmente para pruebas HTTP en Coolify; al poner dominio HTTPS definitivo puede volver a activarse.

## Coolify

- Build pack: Railpack
- Puerto: 3000
- Start: `npm start`
- Healthcheck: `/api/health`
- Persistent storage para multimedia local: monta un volumen persistente con destino `/data/uploads` y define `UPLOAD_DIR=/data/uploads`. De esta forma los archivos no desaparecen al redesplegar.

Variables mínimas:

```env
DATABASE_URL=postgresql://...
DATABASE_SSL=false
JWT_SECRET=...
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://redlibertad...
COOKIE_SECURE=true
MEDIA_STORAGE=local
UPLOAD_DIR=/data/uploads
ADMIN_EMAIL=...
```

Para PostgreSQL interno de Coolify usa `DATABASE_SSL=false`. Para una base externa que exija TLS, usa `DATABASE_SSL=true`.

Para pruebas temporales HTTP usa `COOKIE_SECURE=false`.

## Base de datos

No se cambia el esquema de AURA V0.4.3, por lo que la base existente se puede reutilizar directamente.
