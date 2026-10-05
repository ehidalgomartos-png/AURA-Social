# RedLibertad V1.1.2 — Text Posts

RedLibertad nace sobre la base funcional de AURA V0.4.3, conservando usuarios, perfiles, feed, follows, likes, comentarios, borrado de comentarios, Stories, Reels, mensajería, notificaciones, intereses, consentimiento, contenido sensible, denuncias, moderación, PWA y PostgreSQL.

**Slogan:** “Donde la libertad es lo primero.”

## Base conservada de V1.0

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


## Novedades V1.1 — Mobile Experience

- Portada móvil más compacta: el contenido principal y la publicación de ejemplo aparecen antes.
- Tarjetas de funciones en carrusel horizontal táctil para reducir scroll vertical.
- Formularios de registro/login con objetivos táctiles mayores y mejor contraste.
- Compositor rápido en Inicio: “¿Qué estás pensando?” abre directamente Crear.
- Navegación inferior móvil reforzada, con botón Crear destacado y safe areas.
- Badges móviles para mensajes y notificaciones.
- Compartir es una acción principal visible en cada publicación; mantiene Facebook, WhatsApp, Web Share y copiar enlace.
- Mensajes en móvil pasan a navegación de una sola pantalla: lista → chat → volver.
- Cabecera y compositor del chat optimizados para teclado móvil.
- Microfeedback háptico cuando el dispositivo lo permite.
- Healthcheck y versión actualizados a 1.1.0.

No cambia el esquema de PostgreSQL; se puede desplegar sobre la misma base usada por RedLibertad V1.0/AURA migrada.


## V1.1.1 — Hotfix

- El administrador queda fuera de Explorar, sugerencias y búsqueda de personas.
- "Copiar enlace" funciona también en la URL temporal HTTP mediante fallback compatible.
- Si el navegador bloquea cualquier copia automática, se muestra el texto listo para copiar manualmente.
- Ajuste visual del bloque Compartir en la portada móvil.
- Healthcheck actualizado a 1.1.1.
- Sin cambios en el esquema de PostgreSQL.


## V1.1.2 — Publicaciones de solo texto

- Ya no es obligatorio adjuntar una foto o vídeo para publicar.
- Se puede compartir únicamente una idea, pensamiento, reflexión u opinión.
- Las publicaciones vacías siguen bloqueadas: hace falta texto o multimedia.
- Los Reels siguen necesitando multimedia.
- Las Stories siguen necesitando una foto o vídeo.
- Las publicaciones de texto tienen presentación propia en feed, perfil y Explorar.
- Compartir una publicación de texto funciona mediante su enlace público.
- No requiere cambios de esquema en PostgreSQL.
