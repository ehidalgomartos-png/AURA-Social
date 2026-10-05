# RedLibertad V1.6.0 — Profiles & Activity 2.0

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


## V1.2.0 — Social Feed 2.0

- Me gusta real con estado persistente: tocar de nuevo quita el Me gusta.
- El contador cambia al instante sin recargar todo el feed.
- Cada publicación muestra cuándo se publicó: ahora, minutos, horas, días o fecha.
- El propietario puede editar el texto de su publicación.
- El propietario puede eliminar su publicación con doble confirmación.
- El administrador también puede gestionar publicaciones desde el feed.
- El compositor muestra contador de caracteres hasta 2200.
- Se puede quitar una foto o vídeo seleccionado antes de publicar.
- El selector del feed se mantiene sincronizado al cambiar de modo o después de publicar.
- Conserva publicaciones de solo texto, fotos y vídeos.
- Sin cambios de esquema en PostgreSQL.


## V1.3.0 — Discovery & Engagement

- Hashtags clicables dentro de las publicaciones.
- Búsqueda de publicaciones, ideas, autores y #hashtags.
- Hashtags en tendencia calculados a partir de la actividad reciente.
- Nuevos rankings: Tendencias, Más gustado, Más comentado y Nuevo.
- Guardados/Favoritos persistentes por usuario.
- Vista Guardados dentro de Explorar.
- Sugerencias de personas con explicación de afinidad: intereses en común o seguidores.
- Feed de descubrimiento completo, con Me gusta, comentarios, compartir, guardar y gestión.
- Experiencia priorizada para móvil con pestañas y chips desplazables horizontalmente.
- La tabla saved_posts se crea automáticamente de forma idempotente al usar Guardados.


## V1.4.0 — Visual Refresh & Mobile Energy

- Rediseño visual completo sin cambiar la lógica social.
- Barra inferior móvil flotante con efecto glass, estado activo más visible y botón Crear elevado.
- Cabecera móvil flotante y translúcida.
- Cabeceras de sección con más profundidad, color y jerarquía visual.
- Cards de publicaciones, perfiles, personas, mensajes y notificaciones con sombras, acentos y mejor separación.
- Stories con anillo degradado animado.
- Publicaciones de solo texto con identidad visual reforzada.
- Explorar, tendencias, chips e intereses con más contraste y feedback.
- Perfil, mensajes, modales y formularios pulidos.
- Pantallas vacías más atractivas y menos planas.
- Microinteracciones en Me gusta y Guardados.
- Transiciones suaves al cambiar de sección.
- Toasts animados y mejorados.
- Landing pública actualizada para mantener coherencia de marca.
- Respeta prefers-reduced-motion.
- Sin cambios en el esquema de PostgreSQL.


## V1.5.0 — Community & Viral

- Menciones @usuario clicables dentro de publicaciones y comentarios.
- Notificaciones automáticas cuando alguien te menciona.
- Republicar / quitar republicación con contador persistente.
- Las republicaciones pueden hacer reaparecer contenido en el feed Siguiendo de tus seguidores.
- Aviso visual "X republicó esto" en el feed Siguiendo.
- Listas de Seguidores y Siguiendo accesibles desde los perfiles.
- Botones de estadísticas de perfil convertidos en elementos interactivos.
- Compartir una publicación dentro de RedLibertad enviándola por mensaje privado a @usuario.
- Notificación al autor cuando alguien republica su publicación.
- Tabla reposts creada automáticamente de forma idempotente.
- Nuevos tipos de notificación: mention y repost.
- Sin pasos manuales de migración para la versión desplegada.


## V1.6.0 — Profiles & Activity 2.0

- Perfiles con pestañas Publicaciones, Republicados y Multimedia.
- Las miniaturas del perfil abren la publicación completa.
- Contexto social en perfiles públicos: personas en común y señal "Te sigue".
- Botón Compartir perfil con Web Share o copia de enlace.
- Deep links de perfil mediante /app?profile=usuario.
- Deep links internos de publicación mediante /app?post=id.
- Visor de publicación centrado para navegación desde actividad.
- Notificaciones filtrables por Todo, Menciones, Interacciones, Comunidad, Mensajes y Consentimiento.
- Las notificaciones llevan a la publicación, perfil, conversación o consentimiento correspondiente.
- Estados no leídos sincronizados al abrir una notificación.
- Sin migraciones PostgreSQL nuevas.
