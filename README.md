# RedLibertad V1.79.0 — Public Content Discovery & SEO

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


## V1.7.0 — Retention & Social Momentum

- Nuevo bloque "Ponte al día" en Inicio.
- Recupera publicaciones relevantes desde la última visita del usuario.
- Prioriza contenido de personas seguidas y publicaciones con interacción.
- Si no hay novedades pendientes, muestra destacados de las últimas 24 horas.
- Señal de novedad en la pestaña Nuevo.
- Personas con actividad reciente durante los últimos 7 días.
- Las personas activas se priorizan por afinidad, actividad e intereses compartidos.
- El módulo permanece visible aunque el usuario esté al día, evitando una portada vacía.
- El historial de última visita se guarda en el navegador, sin seguimiento invasivo.
- No añade migraciones PostgreSQL.


## V1.8.0 — Growth & Invites

- Onboarding guiado dentro de Inicio con 5 pasos de activación.
- Progreso visual en porcentaje.
- Pasos para foto de perfil, bio/intereses, seguir personas, primera publicación e interacción.
- Enlace personal de invitación por usuario.
- Compartir invitación con Web Share, WhatsApp o copia al portapapeles.
- La landing reconoce ?ref=usuario y muestra quién te ha invitado.
- El registro conserva la atribución de la invitación.
- Métricas personales de invitados y usuarios activados.
- Notificación al invitador cuando alguien se registra con su enlace.
- Tabla referrals creada automáticamente de forma idempotente.
- Sin pasos manuales de migración.


## V1.9.0 — Privacy & Control

- Nuevo centro de Privacidad accesible desde el perfil.
- Control de quién puede iniciar una conversación: todo el mundo, solo personas que sigues o nadie.
- Opción para aparecer o no en Explorar y sugerencias.
- Opción para mostrar u ocultar la actividad reciente.
- Silenciar usuarios sin bloquearlos.
- Las cuentas silenciadas desaparecen del feed, Stories, tendencias, sugerencias y notificaciones.
- Bloquear y desbloquear usuarios desde perfiles y desde el centro de privacidad.
- Gestión visual de listas de silenciados y bloqueados.
- Los bloqueos siguen rompiendo relaciones de seguimiento.
- Las conversaciones existentes se mantienen aunque cambies la privacidad de mensajes.
- Esquema creado de forma idempotente, sin pasos manuales.


## V1.10.0 — Account & Security

- Nuevo centro Cuenta desde el perfil.
- Cambio de contraseña con verificación de contraseña actual.
- Las sesiones pasan a ser revocables mediante auth_token_version.
- Cambiar la contraseña invalida las demás sesiones y mantiene la actual con un token renovado.
- Opción para cerrar todas las sesiones abiertas, incluida la actual.
- Descarga de una copia JSON de los datos de la cuenta.
- La exportación incluye perfil, intereses, publicaciones, comentarios, relaciones, bloqueos, silenciados, mensajes e invitaciones.
- Eliminación definitiva de cuenta con doble confirmación: @usuario + contraseña actual.
- La cuenta administradora queda protegida frente al borrado desde la app.
- Limpieza de multimedia local asociada a una cuenta eliminada.
- Limpieza de conversaciones huérfanas tras eliminar una cuenta.
- Compatibilidad con sesiones antiguas: los tokens previos se aceptan mientras auth_token_version siga en 0.
- Bootstrap idempotente de las nuevas columnas de seguridad.
- La PWA deja fuera de caché las rutas /api, /uploads y /p para no persistir datos privados ni respuestas dinámicas.


## V1.11.0 — Trust & Moderation 2.0

- Panel de moderación rediseñado y mobile-first.
- Métricas de usuarios activos, suspendidos, bloqueados, denuncias críticas y avisos recientes.
- Denuncias con contexto del contenido y autor afectado.
- Avisos formales de moderación.
- Suspensiones de 24 h, 7 días, 30 días o indefinidas.
- Expiración automática de suspensiones temporales.
- Bloqueo y reactivación de cuentas desde administración.
- Historial completo de acciones por usuario.
- Las suspensiones y bloqueos invalidan inmediatamente las sesiones abiertas.
- El login informa de suspensión activa y fecha de finalización cuando existe.
- Las cuentas administradoras están protegidas frente a suspensión o bloqueo desde el panel.
- Verificación +18 y creador quedan registradas en el historial.
- Esquema y tablas nuevas se crean de forma idempotente.


## V1.12.0 — Verification & Trust

- Nuevo centro Confianza accesible desde el perfil.
- Solicitudes de verificación +18 y de creador.
- Historial de solicitudes pendientes, aprobadas, rechazadas o canceladas.
- Cancelación de solicitudes pendientes por parte del usuario.
- No se almacenan documentos de identidad en el formulario de solicitud.
- Cola administrativa específica de verificaciones.
- Aprobación o rechazo con nota de revisión.
- Al aprobar +18 se actualiza users.age_verified.
- Al aprobar creador se actualizan users.creator_verified y users.age_verified.
- Las decisiones generan una notificación al usuario.
- Las decisiones quedan auditadas en user_moderation_actions.
- Perfiles públicos muestran badges de confianza cuando corresponde.
- Las verificaciones manuales desde la ficha de usuario resuelven también solicitudes pendientes.
- Tabla verification_requests creada de forma idempotente.


## V1.13.0 — Creator Hub & Featured Content

- Nuevo Centro de creador disponible para cuentas con creator_verified.
- Métricas de seguidores, publicaciones, Reels, Me gusta, comentarios, republicaciones y guardados.
- Las métricas de interacción muestran también la actividad de los últimos 30 días.
- Los creadores pueden destacar hasta 3 publicaciones propias y publicadas.
- Las publicaciones destacadas aparecen primero en el perfil.
- Badge visual “★ DESTACADO” en el grid del perfil.
- Gestión para destacar y retirar destacados desde el Centro de creador.
- Control transaccional del límite de 3 publicaciones destacadas.
- Nueva tabla creator_featured_posts con creación idempotente.
- Healthcheck actualizado a 1.13.0 y caché PWA V1.13.


## V1.14.0 — Creator Profile & Links

- Nuevo perfil público ampliado para creadores verificados.
- Titular de creador de hasta 120 caracteres.
- Hasta 5 enlaces públicos por creador.
- Edición de enlaces directamente desde el Centro de creador.
- Los enlaces se muestran como CTAs en el perfil público.
- Métrica agregada de clics por enlace y total en el Centro de creador.
- No se almacena quién hizo clic, IP, dispositivo ni historial individual.
- Validación de URLs http/https.
- Los enlaces conservan sus contadores al editarse.
- Nueva tabla creator_links y nueva columna users.creator_headline.
- Bootstrap idempotente, sin SQL manual.
- Healthcheck actualizado a 1.14.0 y caché PWA V1.14.


## V1.15.0 — Creator Audience & Broadcasts

- Nueva sección de audiencia dentro del Centro de creador.
- Muestra los 20 seguidores más recientes con acceso directo a sus perfiles.
- Nuevo sistema de avisos internos para seguidores.
- Avisos limitados a texto de hasta 280 caracteres.
- Máximo un aviso cada 24 horas por creador.
- El límite se valida dentro de una transacción bloqueando la cuenta del creador.
- Los avisos se entregan mediante notificaciones internas.
- No se envían avisos a seguidores que hayan silenciado o bloqueado al creador.
- Historial de los últimos 10 avisos con número de destinatarios.
- Métrica total de avisos enviados.
- Los avisos aparecen dentro del filtro Comunidad de Notificaciones.
- Tocar un aviso abre el perfil del creador.
- Nueva tabla creator_broadcasts.
- Nuevo tipo de notificación creator_broadcast.
- Bootstrap idempotente y actualización automática de la constraint de notificaciones.
- Healthcheck actualizado a 1.15.0 y caché PWA V1.15.


## V1.16.0 — Fans & Creator Engagement

- Nueva analítica privada de engagement dentro del Centro de creador.
- Audiencia activa de los últimos 30 días.
- Porcentaje de seguidores actuales que han interactuado durante ese periodo.
- Total de Me gusta, comentarios y republicaciones recibidos en 30 días.
- Top 10 fans activos calculado únicamente entre seguidores actuales.
- El ranking suma de forma transparente Me gusta + comentarios + republicaciones.
- Los guardados no se utilizan para identificar o rankear personas.
- Desglose individual de Me gusta, comentarios y republicaciones de cada fan activo.
- Top 5 contenidos con mayor respuesta reciente.
- El rendimiento de contenido incluye cifras agregadas de Me gusta, comentarios, republicaciones y guardados.
- Los rankings son privados y solo visibles para el creador de la cuenta.
- No añade tablas ni requiere migración SQL nueva.
- Healthcheck actualizado a 1.16.0 y caché PWA V1.16.


## V1.17.0 — Creator VIP Circle

- Nuevo Círculo VIP privado para creadores verificados.
- Hasta 50 miembros VIP por creador.
- Solo se pueden añadir seguidores actuales.
- Añadir/quitar VIP directamente desde Tu audiencia o Fans más activos.
- Lista privada de miembros VIP dentro del Centro de creador.
- El estado VIP no se muestra públicamente en perfiles.
- Los miembros que dejan de seguir quedan marcados como inactivos y no reciben avisos VIP.
- Avisos VIP de texto de hasta 280 caracteres.
- Máximo un aviso VIP cada 24 horas por creador.
- Cooldown protegido transaccionalmente.
- Los avisos VIP respetan bloqueos y silencios.
- Nuevo tipo de notificación creator_vip_broadcast.
- Historial de los últimos 10 avisos VIP y número de destinatarios.
- Nuevas tablas creator_vips y creator_vip_broadcasts.
- Bootstrap idempotente y actualización automática de notifications_type_check.
- Healthcheck actualizado a 1.17.0 y caché PWA V1.17.


## V1.18.0 — Exclusive Creator Content

- Nuevo selector de audiencia al publicar: Público o Solo VIP.
- Solo los creadores verificados pueden crear publicaciones Solo VIP.
- El contenido VIP es visible únicamente para:
  - el creador autor,
  - administradores,
  - miembros del círculo VIP que siguen actualmente al creador,
  - participantes aprobados para poder gestionar su consentimiento.
- Los controles +18, sensible y desnudez siguen aplicándose además del control VIP.
- El filtro VIP se aplica en feed, Momentum, Explorar, búsqueda, tendencias, hashtags, guardados, perfiles y detalle.
- Likes, comentarios y guardados validan acceso antes de crear interacción.
- Los posts VIP no pueden republicarse.
- Los posts VIP no ofrecen acciones de compartir.
- La ruta pública /p/:id solo permite publicaciones públicas.
- Menciones desde contenido VIP solo notifican a usuarios autorizados o participantes.
- El contador público de publicaciones no revela contenido VIP a usuarios no autorizados.
- Los usuarios que pierden acceso VIP pueden retirar sus propios Me gusta o guardados sin recuperar acceso al contenido.
- La audiencia de una publicación queda fijada al crearla en esta versión.
- Nueva columna posts.audience con valores public/vip.
- Bootstrap idempotente desde posts, profiles y la ruta pública de compartición.
- Healthcheck actualizado a 1.18.0 y caché PWA V1.18.


## V1.19.0 — VIP Stories & Exclusive Feed

- Stories con audiencia Público o Solo VIP.
- Solo creadores verificados pueden publicar Stories VIP.
- Control de acceso VIP equivalente al de publicaciones exclusivas.
- Las Stories VIP respetan además +18, contenido sensible, bloqueos y silencios.
- Nuevo visor de Stories dentro de la app.
- Navegación anterior/siguiente entre Stories visibles del mismo creador.
- Distintivo visual de Story VIP.
- Nueva pestaña VIP en Inicio.
- El feed VIP muestra únicamente publicaciones exclusivas a las que el usuario tiene acceso.
- Badge de contenido VIP nuevo combinando publicaciones y Stories autorizadas.
- El badge se limpia al abrir el feed VIP o una Story VIP.
- Creator Hub añade la métrica de Stories VIP activas.
- Nueva columna stories.audience con valores public/vip.
- Bootstrap idempotente para stories.audience y creator_vips.
- Se corrige el bloque DO de posts_audience_check en db/schema.sql para instalaciones nuevas.
- /api/health actualizado a 1.19.0.
- Caché PWA actualizada a V1.19.

### Monetización

V1.19 no incorpora monetización activa:
- Sin precios.
- Sin suscripciones.
- Sin pagos.
- Sin checkout.
- Sin saldo ni créditos.
- Sin paywalls de pago.

La arquitectura public/vip queda reutilizable para una futura capa comercial, pero el acceso VIP actual depende exclusivamente del Círculo VIP gratuito gestionado por el creador.


## V1.20.0 — Creator Publishing Tools

- Nuevos borradores para creadores verificados.
- Programación de publicaciones entre 5 minutos y 90 días.
- Publicación automática desde el servidor.
- Cola editorial dentro del Centro de creador.
- Gestión de borradores y programadas:
  - Publicar ahora.
  - Programar.
  - Reprogramar.
  - Volver a borrador.
  - Eliminar.
- Los borradores nunca aparecen en feeds, perfiles ni búsquedas.
- Las publicaciones programadas permanecen ocultas hasta su hora.
- Al publicarse automáticamente reciben una nueva fecha de publicación para aparecer correctamente en “Nuevo”.
- La programación funciona también con audiencia Solo VIP.
- El consentimiento de personas etiquetadas tiene prioridad:
  - un post programado no sale antes de estar aprobado,
  - si se aprueba antes de la hora, espera a la hora,
  - si la hora ya pasó, se publica al obtener la última aprobación.
- Los borradores con participantes no envían solicitudes de consentimiento hasta programar o publicar.
- Las menciones de borradores/programados no se notifican antes de publicar.
- Se corrigen referencias heredadas en notificaciones de Me gusta y comentarios.
- Nuevas columnas posts.creator_state y posts.scheduled_for.
- Nuevo índice de cola de programación.
- Bootstrap idempotente y scheduler interno cada 60 segundos.
- /api/health actualizado a 1.20.0.
- Caché PWA actualizada a V1.20.

### Monetización

V1.20 continúa sin monetización activa. No existen precios, planes, suscripciones, checkout, créditos, saldo ni pagos. Las herramientas editoriales funcionan igual para contenido público y VIP gratuito.


## V1.21.0 — Creator Content Calendar

- Nuevo calendario editorial privado dentro del Centro de creador.
- Vista mensual con estados:
  - Borrador.
  - Programado.
  - Publicado.
- Navegación mes anterior / hoy / mes siguiente.
- Filtro por audiencia Público / Solo VIP.
- Filtro por etiqueta editorial interna.
- Nueva fecha editorial privada por publicación.
- Nueva etiqueta interna privada de hasta 40 caracteres.
- Un borrador puede aparecer en calendario sin estar programado.
- Si no hay fecha editorial:
  - un programado usa scheduled_for,
  - un publicado usa created_at.
- La fecha editorial nunca cambia la fecha pública del post.
- Las etiquetas editoriales nunca se muestran públicamente.
- Fecha/etiqueta pueden editarse en borradores, programados y contenido ya publicado.
- Los posts publicados pueden abrirse directamente desde el calendario.
- Los borradores/programados llevan a su tarjeta de gestión.
- El compositor permite definir fecha editorial y etiqueta al crear contenido.
- Nuevo endpoint privado /api/posts/creator/calendar.
- Nuevo endpoint privado /api/posts/creator/editorial/:id.
- Nuevas columnas posts.editorial_date y posts.editorial_label.
- Índice idx_posts_creator_editorial_date.
- Bootstrap idempotente desde posts y profiles.
- /api/health actualizado a 1.21.0.
- Caché PWA actualizada a V1.21.

### Monetización

V1.21 continúa sin monetización activa. El calendario y la organización editorial funcionan igual con contenido público y VIP gratuito.


## V1.22.0 — Creator Community Tools

- Nuevas herramientas de comunidad dentro de publicaciones:
  - Encuesta.
  - Pregunta abierta.
- Solo los creadores verificados pueden crear estas herramientas.
- Funcionan con contenido Público y Solo VIP.
- Funcionan con publicación inmediata, borradores y programación.
- Una encuesta/pregunta puede existir sin caption ni multimedia.

### Encuestas
- Pregunta de hasta 300 caracteres.
- Entre 2 y 4 opciones.
- Una persona mantiene un único voto por encuesta.
- El voto puede cambiarse o retirarse.
- Los resultados muestran únicamente totales y porcentajes agregados.
- Nunca se exponen públicamente identidades de votantes.

### Preguntas abiertas
- Enunciado de hasta 300 caracteres.
- Cada persona puede mantener una respuesta de hasta 1000 caracteres.
- La respuesta puede actualizarse o retirarse.
- El usuario ve únicamente su propia respuesta.
- El creador ve el listado completo dentro de su Centro de creador.
- El resto de usuarios solo ve el número total de respuestas.

### Centro de creador
- Nueva sección Comunidad · respuestas y encuestas.
- Métricas privadas:
  - número de encuestas,
  - votos recibidos,
  - preguntas abiertas,
  - respuestas recibidas.
- Bandeja de respuestas recientes con usuario, respuesta y publicación.
- Resumen de encuestas recientes con resultados agregados.

### Privacidad y acceso
- Las herramientas heredan la visibilidad del post.
- Un contenido VIP exige acceso VIP también para votar o responder.
- Bloqueos siguen aplicándose mediante las reglas existentes del post.
- Si alguien pierde acceso después de interactuar, puede retirar su voto o respuesta sin recuperar acceso al contenido.
- Las respuestas abiertas completas solo se devuelven al creador propietario y al propio autor de la respuesta.

### Base de datos
- creator_polls.
- creator_poll_options.
- creator_poll_votes.
- creator_questions.
- creator_question_responses.
- Índices de opciones, votos y respuestas.
- Cascada automática al borrar una publicación.
- Bootstrap idempotente.

### Monetización

V1.22 continúa sin monetización activa: sin pagos, suscripciones, precios, checkout, créditos, saldos ni paywalls. Las herramientas de comunidad funcionan igual para contenido público y VIP gratuito.


## V1.23.0 — Community Management 2.0

- Gestión avanzada de encuestas y preguntas del creador.
- Estados de participación:
  - abierta,
  - cerrada,
  - archivada.
- Cerrar mantiene la herramienta visible y conserva resultados, pero bloquea nuevas participaciones.
- Reabrir permite volver a recibir votos o respuestas.
- Archivar oculta la herramienta del post sin borrar votos ni respuestas.
- Restaurar devuelve la herramienta como activa y cerrada para evitar reapertura accidental.
- Las respuestas abiertas pueden marcarse como destacadas de forma privada en el Centro de creador.
- Destacar una respuesta no la publica ni cambia la privacidad de V1.22.

### Centro de creador
- Filtro Activas / Archivadas / Todas.
- Filtro Solo respuestas destacadas.
- Vista separada de:
  - respuestas,
  - encuestas,
  - preguntas.
- Métricas de herramientas activas, archivadas, participaciones y respuestas destacadas.
- Acciones directas cerrar / reabrir / archivar / restaurar.
- Acciones destacar / quitar destacada en respuestas.

### Privacidad
- Herramientas archivadas no se adjuntan a posts públicos.
- Herramientas cerradas siguen mostrando resultados agregados o la propia respuesta, pero no permiten nueva participación.
- Identidades de votantes siguen sin exponerse.
- Respuestas destacadas siguen siendo privadas para el creador.
- El usuario conserva la posibilidad de retirar su propio voto o respuesta.

### Base de datos
- creator_polls.status / is_open / archived_at.
- creator_questions.status / is_open / archived_at.
- creator_question_responses.creator_starred / starred_at.
- Constraints de estado e índices nuevos.
- Bootstrap idempotente.

### Monetización

V1.23 continúa sin monetización activa: sin pagos, suscripciones, precios, checkout, créditos, saldos ni paywalls.


## V1.24.0 — Community Insights & Creator Notifications

- Notificación al creador cuando una persona participa por primera vez en una encuesta.
- Notificación al creador cuando una persona responde por primera vez a una pregunta abierta.
- Cambiar un voto o editar una respuesta no genera nuevas notificaciones.
- Si una persona retira su interacción y vuelve después, el aviso no se duplica.
- Índice único parcial de base de datos para reforzar esa deduplicación.
- Los nuevos avisos aparecen en Notificaciones → Comunidad.
- Al tocar el aviso se abre directamente la gestión de comunidad del Centro de creador.

### Insights de comunidad
- Participación total de los últimos 7 días.
- Participación total de los últimos 30 días.
- Votos de 7/30 días.
- Respuestas de 7/30 días.
- Personas únicas que participaron en 30 días.
- Evolución diaria de votos y respuestas durante los últimos 14 días.
- Ranking de hasta 8 encuestas/preguntas con más participación en 30 días.
- El ranking muestra:
  - tipo,
  - Público / VIP,
  - abierta / cerrada / archivada,
  - actividad de 7 y 30 días.

### Privacidad
- Los insights son privados para el creador.
- Los votantes siguen mostrándose únicamente de forma agregada.
- Las respuestas abiertas mantienen las reglas privadas de V1.22/V1.23.
- Las notificaciones identifican al participante solo ante el creador propietario.
- No se añade tracking externo.

### Base de datos
- Nuevos tipos de notificación:
  - creator_poll_vote.
  - creator_question_response.
- Índices de fecha para votos y respuestas.
- Índice único parcial para avisos de primera participación.
- Bootstrap idempotente.

### Monetización

V1.24 continúa sin monetización activa: sin pagos, suscripciones, precios, checkout, créditos, saldos ni paywalls.


## V1.25.0 — Community Activity Center

- Nuevo Centro de actividad dentro del Centro de creador.
- Actividad basada en los avisos de primera participación de V1.24, sin duplicar votos ni respuestas.
- Filtros:
  - Pendiente.
  - Revisado.
  - Todo.
- Agrupación por encuesta o pregunta para evitar saturación.
- Cada grupo muestra:
  - Público / VIP.
  - Abierta / cerrada / archivada.
  - participaciones totales.
  - participaciones pendientes.
  - hasta 6 participantes recientes.
- Acciones:
  - marcar una participación como revisada,
  - marcar un grupo completo,
  - marcar toda la actividad pendiente.
- Estado Revisado es privado del creador y no altera el voto, respuesta ni notificación original.
- Si una persona retiró su voto o respuesta, el Centro de actividad muestra el estado retirado.
- Los avisos de comunidad llevan directamente a este Centro de actividad.

### Datos
- Nueva tabla creator_community_notification_reviews.
- Referencia a notifications con ON DELETE CASCADE.
- Un único estado de revisión por notificación.
- Índice por creador y fecha de revisión.
- Bootstrap idempotente.

### Privacidad
- El Centro de actividad solo está disponible para el creador verificado propietario.
- No cambia la privacidad de votos o respuestas.
- No expone identidades de votantes al público.
- No añade tracking externo.

### Monetización

V1.25 continúa completamente sin monetización activa: sin pagos, suscripciones, precios, checkout, créditos, saldos ni paywalls.


## V1.26.0 — Creator Follow-up & Private Notes

- Nueva capa privada de trabajo sobre el Centro de actividad V1.25.
- Cada participación puede tener:
  - prioridad Normal / Alta,
  - nota privada de hasta 1000 caracteres,
  - estado Seguimiento,
  - fecha/hora opcional de seguimiento.
- Estos datos nunca se muestran al participante ni al público.
- Prioridad, nota y seguimiento son independientes del estado Revisado.
- Una actividad puede:
  - estar revisada y seguir en seguimiento,
  - tener prioridad alta sin estar revisada,
  - conservar una nota aunque ya se haya marcado como revisada.

### Centro de actividad
- Nuevo filtro Enfoque:
  - Todas.
  - Prioridad alta.
  - Seguimiento.
- Contadores privados de:
  - actividades con prioridad alta,
  - actividades en seguimiento.
- Las actividades prioritarias reciben un indicador visual.
- Las actividades en seguimiento muestran un distintivo y, si existe, su fecha.
- Editor privado compacto por participación.
- En móvil el editor se adapta a ancho completo.

### API
- PATCH /api/posts/creator/community-activity/:notificationId/meta.
- Solo el creador verificado propietario puede escribir o leer estos datos.
- GET /api/posts/creator/community-activity admite focus=all|high|followup.
- La respuesta incluye los metadatos privados únicamente dentro del endpoint del creador.

### Base de datos
- Nueva tabla creator_community_activity_meta.
- Campos:
  - notification_id.
  - creator_id.
  - priority.
  - private_note.
  - follow_up.
  - follow_up_at.
  - updated_at.
- Constraint priority normal/high.
- ON DELETE CASCADE desde notifications.
- Índice por creador, seguimiento, prioridad y actualización.
- Bootstrap idempotente.

### Privacidad
- Notas y prioridades no alteran la publicación, voto, respuesta ni notificación.
- No se exponen en feeds, perfiles ni APIs públicas.
- No se añade tracking externo.

### Monetización

V1.26 continúa completamente sin monetización activa: sin pagos, suscripciones, precios, checkout, créditos, saldos ni paywalls.


## V1.27.0 — Follow-up Dashboard

- Nuevo dashboard privado dentro del Centro de creador.
- Organiza seguimientos existentes de V1.26 por vencimiento:
  - Vencidos.
  - Hoy.
  - Próximos 7 días.
  - Más adelante.
  - Sin fecha.
- Resumen privado con:
  - total de seguimientos,
  - vencidos,
  - hoy,
  - próximos 7 días,
  - prioridad alta.

### Búsqueda
- Búsqueda server-side dentro de notas privadas.
- Máximo 120 caracteres.
- No busca en contenido público ni expone notas fuera del Creator Hub.
- Debounce ligero en la interfaz para evitar peticiones innecesarias.

### Acciones masivas
- Selección múltiple de seguimientos visibles.
- Seleccionar todos los visibles.
- Acciones:
  - Prioridad alta.
  - Prioridad normal.
  - Marcar revisado.
  - Cerrar seguimiento.
- Cerrar seguimiento desactiva follow_up y limpia follow_up_at.
- Las acciones se limitan a actividades propias del creador autenticado.

### Integración con V1.25/V1.26
- Abrir en actividad lleva al Centro de actividad con filtro Seguimiento.
- Cambiar una nota, prioridad o seguimiento desde V1.26 refresca también el dashboard.
- Marcar actividad revisada desde V1.25 refresca también el dashboard.
- Los estados Revisado y Seguimiento siguen siendo independientes.

### API
- GET /api/posts/creator/community-follow-ups.
- Query params:
  - window=all|overdue|today|week|later|undated.
  - q=texto privado.
- PATCH /api/posts/creator/community-follow-ups/bulk.
- Acciones permitidas:
  - priority_high.
  - priority_normal.
  - mark_reviewed.
  - close_follow_up.

### Base de datos
- Reutiliza creator_community_activity_meta.
- Nuevo índice:
  - idx_creator_community_activity_follow_up_at.
- Optimizado por creator_id + follow_up + follow_up_at + priority.
- Bootstrap idempotente.

### Privacidad
- Dashboard disponible solo para creador verificado.
- Las notas privadas no salen de endpoints del creador.
- Sin cambios en posts, votos, respuestas ni privacidad pública.
- Sin tracking externo.

### Monetización

V1.27 continúa completamente sin monetización activa: sin pagos, suscripciones, precios, checkout, créditos, saldos ni paywalls.


## V1.27.1 — Follow-up Dashboard Hotfix

- Corrige el resumen de “Hoy” y “Próximos 7 días” para usar el mismo límite de día local del navegador que el listado.
- Evita registrar repetidamente los listeners del dashboard al refrescar el Centro de actividad.
- Añade filtro combinable de prioridad: Todas / Alta / Normal.
- Añade acción individual “Completar seguimiento”.
- Conserva búsqueda privada, acciones masivas, orden por prioridad/fecha y privacidad por creador.
- Sin cambios de esquema adicionales y sin monetización activa.


## V1.28.0 — Follow-up Workflow & History

- Evoluciona el Follow-up Dashboard sin monetización activa.
- Nuevo historial privado de seguimientos completados.
- Los seguimientos completados guardan `completed_at` y conservan la fecha que tenían programada.
- Pestañas privadas:
  - Activos.
  - Completados.
- Reabrir un seguimiento completado sin perder nota ni prioridad.
- Reprogramación rápida individual:
  - +1 hora.
  - Mañana a las 09:00 en hora local del navegador.
  - +7 días.
  - Sin fecha.
- Reprogramación masiva con los mismos presets principales.
- Las acciones masivas se adaptan al estado Activos/Completados.
- El historial permite búsqueda por nota privada y filtro por prioridad.
- Los completados no inflan los contadores de vencidos, hoy o próximos.
- Índice privado por `creator_id + completed_at` para historial eficiente.
- Bootstrap idempotente con `ADD COLUMN IF NOT EXISTS completed_at`.
- Todo continúa restringido al creador verificado propietario.

### Privacidad

- `completed_at`, notas, prioridad y fechas de seguimiento son privados.
- No aparecen en feeds, perfiles ni APIs públicas.
- No se añade tracking externo.

### Monetización

V1.28 continúa completamente gratis: sin pagos, suscripciones, precios, checkout, créditos, saldo ni paywalls.


## V1.29.0 — Creator Tasks & Reminders

- Tareas privadas del creador con título, nota, prioridad y vencimiento.
- Estados Pendiente / Completada.
- Reapertura y reprogramación rápida.
- Filtros por estado, prioridad y búsqueda privada.
- Resumen de pendientes, altas, vencidas y completadas recientes.
- API preparada para relacionar tareas con actividad, usuario o publicación.
- Bootstrap idempotente e índice por creador/estado/fecha.
- Sin monetización activa.


## V1.30.0 — Creator CRM Lite

- Ficha privada por seguidor o participante de comunidad.
- Prioridad normal/alta, nota privada y hasta 10 etiquetas.
- Señales de interacción de 30 días, VIP, seguimiento y tareas abiertas.
- Búsqueda por persona, nota o etiqueta.
- Crear una tarea relacionada directamente desde la ficha CRM.
- Todo privado del creador y sin monetización activa.


## V1.31.0 — Audience Segments

- Segmentos automáticos privados: seguidores recientes, activos 30 días, VIP, inactivos 30 días y prioridad alta.
- Segmentos manuales privados, hasta 20 por creador.
- Añadir/quitar miembros por @usuario y consultar miembros.
- Base preparada para comunicaciones segmentadas de V1.32.
- Sin monetización activa.


## V1.32.0 — Creator Communication Center

- Comunicaciones privadas de gestión con borradores, envío inmediato y programación.
- Audiencias: todos, VIP, segmentos automáticos y segmentos manuales.
- Historial con estado, fecha y destinatarios.
- Programador interno para comunicaciones vencidas.
- Respeta bloqueos, silencios y el límite anti-spam de 24 horas.
- Sin monetización activa.


## V1.33.0 — Advanced Creator Analytics

- Comparación 7/30/90 días con el periodo anterior equivalente.
- Crecimiento de seguidores, publicaciones e interacciones.
- Likes, comentarios, republicaciones y guardados.
- Personas únicas, participación de comunidad y recurrencia.
- Conversión aproximada de seguidores a participantes.
- Tareas completadas y alcance de comunicaciones.
- Tendencia diaria de 14 días y top contenido.
- Cálculo sobre datos reales, sin tracking externo ni tabla duplicada de métricas.
- Sin monetización activa.


## V1.34.0 — Community Automation

- Automatizaciones privadas, desactivadas por defecto.
- Tareas vencidas → prioridad alta.
- Participación recurrente → tarea mensual.
- Seguimiento vencido → tarea relacionada.
- Contacto CRM prioritario sin tarea abierta → tarea mensual.
- Ejecución manual o automática cada hora.
- source_key e inserciones idempotentes para evitar duplicados.
- Nunca publica ni envía comunicaciones automáticamente.
- Sin monetización activa.


## V1.35.0 — Creator Hub 2.0

- Centro de creador reorganizado en seis áreas: Resumen, Publicar, Comunidad, Relaciones, Comunicación y Analítica.
- Panel de mando con seguidores, tareas, pendientes de comunidad, seguimientos, publicaciones y comunicaciones programadas.
- Navegación por áreas que evita una pantalla interminable.
- Refresco de Creator Ops al abrir el centro y botón de actualización manual.
- Publicar agrupa calendario y borradores/programación.
- Comunidad agrupa encuestas, preguntas, actividad y follow-up.
- Relaciones agrupa tareas, CRM, segmentos, audiencia, VIP y automatizaciones.
- Comunicación agrupa Communication Center y aviso rápido compatible.
- Analítica agrupa engagement existente y analítica avanzada.
- Sin monetización activa.


## V1.36.0 — Messaging 2.0

- Organización privada del inbox por usuario.
- Fijar/desfijar conversaciones.
- Archivar/desarchivar conversaciones sin borrar mensajes.
- Silenciar/reactivar avisos de una conversación como preferencia privada.
- Filtros Activas / No leídas / Archivadas.
- Búsqueda de conversaciones por nombre y @usuario.
- Ordena primero conversaciones fijadas y no leídas.
- Resumen de no leídas, fijadas y archivadas.
- Al enviar en una conversación archivada por el remitente, vuelve automáticamente a Activas para ese usuario.
- Mantiene consentimiento de contenido sensible, bloqueos y privacidad de mensajes.
- Bootstrap idempotente y mobile-first.
- Sin monetización activa.


## V1.37.0 — Discovery 2.0

- Nueva pestaña Para ti dentro de Explorar.
- Ranking personalizado con personas seguidas, conexiones comunes e interacción del contenido.
- “No me interesa” para publicaciones dentro de Explorar.
- Ocultar sugerencias de personas sin bloquearlas ni silenciarlas.
- El feedback es privado por usuario y se respeta en recomendaciones, tendencias y búsquedas relevantes.
- Se mantienen bloqueos, silencios y discoverable.
- Tabla idempotente discovery_hidden_items.
- Sin monetización activa.


## V1.38.0 — Profiles 2.0

- Estado breve de perfil de hasta 80 caracteres.
- Visible bajo el @usuario en perfil propio y público.
- Señal “Te sigue” más clara en perfiles públicos.
- Fecha de entrada en RedLibertad.
- Actividad reciente únicamente si el usuario mantiene activado “mostrar actividad”.
- Mantiene intereses, ubicación, web, conexiones mutuas, badges y Creator Profile.
- Sin registro de visitas de perfil ni tracking de quién consulta a quién.
- Bootstrap idempotente.
- Sin monetización activa.


## V1.39.0 — Stories & Reels 2.0

- Stories recuerdan si ya las has visto y muestran un anillo atenuado al completar el grupo.
- Las vistas se registran una sola vez por Story/persona y se actualiza viewed_at al volver a verla.
- El autor puede ver el contador agregado de vistas de su propia Story; no se añade lista pública de espectadores.
- Reels incorpora endpoint dedicado y prioriza Reels no vistos antes de repetir contenido.
- Las vistas de Reel son únicas por usuario y solo se registran al alcanzar visibilidad suficiente en pantalla.
- Los Reels muestran contador de vistas agregado.
- Se mantienen contenido sensible, VIP, bloqueos, silencios y feedback de descubrimiento.
- Bootstrap idempotente.
- Sin monetización activa.


## V1.40.0 — Retention & Growth 2.0

- Nuevo resumen de regreso sincronizado entre dispositivos.
- Guarda únicamente cuándo el usuario vio Inicio por última vez.
- Resume:
  - mensajes sin leer,
  - notificaciones pendientes,
  - publicaciones nuevas de personas seguidas,
  - Stories visibles aún no vistas,
  - Reels visibles aún no vistos,
  - nuevos seguidores desde la última visita.
- Cada tarjeta lleva directamente a la sección correspondiente.
- El estado se limita a los últimos 30 días para evitar recaps indefinidos.
- No usa rachas, presión artificial, puntuaciones de adicción ni notificaciones fabricadas.
- Respeta bloqueos, silencios, audiencia VIP y preferencias de contenido sensible.
- Corrige un bug heredado de V1.36: silenciar una conversación impide ahora crear nuevas notificaciones de mensaje para esa conversación; los mensajes siguen llegando y siguen contando como no leídos dentro del inbox.
- Bootstrap idempotente con user_experience_state.
- Sin monetización activa.


## V1.41.0 — Comments 2.0

- Respuestas a comentarios con un nivel de profundidad para mantener conversaciones legibles.
- Contexto visual “Respondiendo a @usuario” antes de publicar.
- Contador de respuestas por comentario raíz.
- Las respuestas permanecen agrupadas bajo su comentario raíz.
- Notificación específica al autor del comentario respondido.
- Evita duplicar la notificación cuando el autor del comentario también es propietario de la publicación.
- Mantiene notificaciones al propietario de la publicación y menciones existentes.
- El borrado de un comentario raíz elimina también sus respuestas mediante integridad referencial.
- Las previsualizaciones del feed muestran comentarios raíz para evitar respuestas sin contexto.
- Bootstrap idempotente.
- Sin monetización activa.


## V1.42.0 — Live Activity 2.0

- Canal privado Server-Sent Events autenticado mediante la sesión existente.
- Actualiza en vivo el contador de mensajes sin leer.
- Actualiza en vivo el contador de notificaciones.
- Si Mensajes está abierto, refresca la lista automáticamente ante actividad nueva.
- Si el chat activo está abierto, actualiza únicamente el hilo para no destruir el texto o archivo que el usuario esté preparando.
- Si Notificaciones está abierta, actualiza la lista automáticamente.
- El stream solo envía contadores e identificadores privados de cambio; no transmite cuerpos de mensajes ni contenido sensible.
- Heartbeat y reconexión automática del navegador.
- Funciona entre varias instancias porque la señal se calcula desde PostgreSQL, sin memoria compartida.
- Sin dependencias nuevas.
- Sin monetización activa.


## V1.43.0 — Reels Immersive 2.0

- Reels se convierte en un scroll vertical propio con una tarjeta por pantalla.
- Scroll snap y stop obligatorio para evitar saltos entre varios Reels.
- Autoplay silenciado únicamente cuando un vídeo local ocupa al menos el 72% de la vista.
- Pausa automática al pasar al siguiente Reel o abandonar la sección.
- Respeta prefers-reduced-motion: en ese caso no fuerza autoplay.
- Mantiene controles nativos del vídeo para que el usuario pueda activar sonido y controlar reproducción.
- Los iframes externos se mantienen manuales para no forzar APIs de terceros.
- El registro de vista sigue siendo único y se activa con visibilidad suficiente.
- Oculta la previsualización inline de comentarios dentro del carrusel inmersivo para reducir ruido; el botón Comentarios sigue disponible.
- Sin monetización activa.


## V1.44.0 — Connections 2.0

- Una Conexión se detecta automáticamente cuando dos personas se siguen mutuamente.
- No crea una relación paralela ni duplica datos: reutiliza la tabla follows existente.
- Nuevo bloque “Tus conexiones” en Explorar.
- Ordena conexiones por actividad reciente visible, intereses en común y antigüedad de la conexión.
- Muestra estado breve, ubicación y contexto de intereses cuando existen.
- Botón Mensaje abre directamente la conversación existente o crea una nueva respetando privacidad y bloqueos.
- Perfil propio muestra el número de conexiones.
- Perfil público distingue claramente “✓ Conexión” de “Te sigue”.
- Mantiene bloqueos y silencios fuera del listado de conexiones recomendado.
- Sin monetización activa.


## V1.45.0 — PWA & Performance 2.0

- Service Worker dividido en caché de shell y caché de recursos estáticos.
- Navegación HTML network-first con fallback offline a /app o portada.
- Recursos estáticos same-origin usan stale-while-revalidate.
- APIs, /uploads, páginas públicas /p/ y recursos externos quedan fuera del caché del Service Worker.
- Elimina automáticamente cachés antiguas de RedLibertad durante activate.
- Registro del Service Worker con updateViaCache:none y comprobación de actualización al volver a primer plano.
- Añade creator-ops.css/js y favicon al shell offline.
- Feeds largos usan content-visibility cuando el navegador lo soporta para reducir trabajo de render fuera de pantalla.
- Imágenes de contenido usan loading=lazy + decoding=async; avatares usan decoding=async.
- Precarga el logo crítico de la aplicación.
- No cachea mensajes privados ni multimedia subida por usuarios.
- Sin monetización activa.


## V1.46.0 — Chat Presence & Read Receipts

- Presencia privada únicamente entre miembros de conversaciones existentes.
- Estado En línea con caducidad automática tras 45 segundos sin heartbeat.
- Indicador Escribiendo… con ventana efímera de 7 segundos.
- Última actividad de chat visible cuando la otra persona no está en línea.
- Recibos Enviado / Visto derivados de conversation_members.last_read_at, sin tabla de tracking por mensaje.
- Punto de presencia en la lista de conversaciones.
- SSE amplía la señal en vivo con presencia y lectura del interlocutor.
- Heartbeat del cliente cada 20 segundos mientras la app está visible.
- Bootstrap y migración idempotentes mediante user_chat_presence.
- Sin monetización activa.


## V1.47.0 — Message Replies & Reactions

- Respuesta a mensajes concretos con cita contextual.
- La cita nunca revela texto o multimedia sensible si el receptor aún no tiene permiso.
- Reacciones rápidas: corazón, me gusta, risa, fuego, sorpresa y tristeza.
- Una reacción por usuario y mensaje, editable y eliminable.
- Conteos agregados de reacciones dentro de cada burbuja.
- Reacciones sincronizadas mediante el stream de actividad en vivo.
- La referencia al mensaje original usa ON DELETE SET NULL para conservar la respuesta si el original desaparece.
- Bootstrap/migraciones idempotentes para reply_to_message_id y message_reactions.
- Sin monetización activa.


## V1.48.0 — Push Notifications PWA

- Web Push real con Service Worker y consentimiento explícito por dispositivo.
- La app nunca solicita permiso automáticamente: el usuario lo activa desde Cuenta.
- Suscripciones persistentes por usuario/dispositivo en push_subscriptions.
- Cola push_jobs alimentada automáticamente desde la tabla notifications mediante trigger PostgreSQL.
- Worker con reintentos, expiración de trabajos antiguos y limpieza de endpoints 404/410.
- El push reutiliza el texto seguro de la notificación; no incluye cuerpos privados de mensajes ni multimedia sensible.
- Respeta usuarios silenciados y bloqueados antes de entregar.
- Deep links desde push a conversación, publicación, perfil, verificación o centro de notificaciones.
- VAPID es opcional: si no está configurado, todo el resto de RedLibertad sigue funcionando sin cambios.
- Variables de producción: PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY y PUSH_VAPID_SUBJECT.
- Dependencia web-push 3.6.7.
- Sin monetización activa.


## V1.49.0 — Mobile Social Polish

- Uso de VisualViewport para adaptar el chat a la altura real disponible cuando aparece el teclado móvil.
- La barra inferior se oculta temporalmente mientras el teclado ocupa la pantalla para no tapar el compositor.
- El textarea de mensajes crece automáticamente hasta un límite cómodo.
- Safe areas reforzadas en chat y modales tipo bottom sheet.
- Estado de conectividad global: Sin conexión y Conexión recuperada.
- La navegación recuerda la posición de scroll de Inicio, Explorar, Perfil, Mensajes y Notificaciones.
- Al tocar de nuevo la pestaña activa se vuelve suavemente al inicio.
- Touch targets reforzados para dispositivos táctiles.
- Estados :focus-visible claros para navegación con teclado.
- prefers-reduced-motion desactiva animaciones y transiciones no esenciales.
- Sin monetización activa.


## V1.50.0 — Group Chats 2.0

- Conversaciones directas y de grupo comparten la misma bandeja sin romper chats existentes.
- Grupos de hasta 20 personas con nombre y propietario.
- Creación de grupos respetando privacidad de mensajes y bloqueos de cada persona invitada.
- Gestión básica: renombrar, añadir/quitar miembros, salir y eliminar grupo por el propietario.
- Presencia en vivo agregada: personas en línea y quién está escribiendo.
- Mensajes de grupo muestran remitente y recibos Enviado / Visto por N / Visto por todos.
- Reacciones y respuestas V1.47 funcionan también en grupos.
- Consentimiento sensible se evalúa por remitente y puede revocarse individualmente desde participantes.
- Mensajes de usuarios bloqueados quedan ocultos dentro de grupos y no generan notificaciones.
- Nuevos miembros no ven historial anterior a su incorporación ni citas de mensajes previos.
- Los recibos de lectura solo cuentan a miembros que ya pertenecían al grupo cuando se envió el mensaje.
- Un mensaje nuevo devuelve la conversación a la bandeja activa de todos los miembros.
- Migraciones/bootstrap idempotentes.
- Se corrige el quoting SQL del trigger Web Push en schema.sql detectado durante esta fase.
- Sin monetización activa.


## V1.51.0 — Share to Chat

- Posts y Reels públicos se pueden enviar como tarjeta interna a chats directos y grupos.
- El modal Compartir muestra conversaciones recientes y permite abrir un chat nuevo por @usuario.
- El mensaje guarda referencia estructurada al post en lugar de depender de una URL pegada.
- Contenido VIP nunca puede compartirse por chat, incluso mediante una petición manipulada.
- El servidor valida que quien comparte tenga acceso a la publicación.
- Cada receptor vuelve a validar accesibilidad: bloqueos, estado del autor, moderación y audiencia.
- Contenido sensible compartido respeta verificación +18 y preferencia Mostrar contenido sensible.
- Si el post se elimina, cambia de audiencia o deja de estar disponible, el mensaje muestra “Publicación no disponible”.
- Se conserva un ID histórico independiente de la FK para no dejar mensajes vacíos tras borrado.
- Tarjetas con autor, tipo Post/Reel, multimedia, extracto y acceso al post original.
- La previsualización del inbox muestra “Publicación compartida”.
- Sin monetización activa.


## V1.52.0 — Connection Circles

- Círculos privados para organizar conexiones mutuas.
- Círculo fijo “Favoritas” creado automáticamente por usuario.
- Hasta 12 círculos personalizados.
- Crear, renombrar y eliminar círculos sin afectar relaciones sociales.
- Añadir o quitar una conexión de uno o varios círculos.
- Filtro de “Tus conexiones” por círculo.
- Favoritas aparecen primero en el listado general.
- Etiquetas privadas de círculos visibles solo para el propietario.
- Las membresías no se exponen a la otra persona ni a feeds/perfiles públicos.
- Solo conexiones mutuas activas pueden añadirse a círculos.
- Al romper el seguimiento mutuo o bloquear, se limpian membresías en ambos sentidos para evitar estados antiguos que puedan revivir.
- Bootstrap y migraciones idempotentes.
- Sin monetización activa.


## V1.53.0 — Connections Center 2.0

- Centro dedicado de conexiones además del acceso rápido desde Explorar.
- Búsqueda privada por nombre, @usuario, ciudad, estado, intereses y círculos.
- Filtros: Todas, Nuevas, Activas, Intereses, Conversación reciente y Pendientes.
- Resumen de conexiones, nuevas, activas y con mensajes pendientes.
- Integración completa con Favoritas y círculos privados.
- Señal de conversación reciente sin exponer el cuerpo de mensajes.
- CTA directo a Mensaje y acceso a perfil.
- Respeta bloqueos, silencios, actividad privada y relaciones de seguimiento mutuo.
- Mobile-first y sin monetización.


## V1.54.0 — Community Conversations

- Continuidad social integrada en Mensajes, sin mecanismos adictivos.
- Conversaciones con mensajes pendientes.
- Conversaciones cuyo último mensaje propio lleva tiempo sin respuesta, mostradas sin presión.
- Sugerencias para retomar conversaciones recientes que llevan unos días inactivas.
- Conexiones nuevas de los últimos 14 días.
- Actividad reciente de conexiones que permiten mostrar su actividad.
- Bloqueos y silencios respetados en todas las sugerencias.
- No se exponen cuerpos de mensajes en el panel de continuidad.
- Datos derivados de relaciones y actividad existentes; no requiere nuevas tablas.
- Mobile-first.
- Sin monetización activa.


## V1.55.0 — Connection Context & Starters

- Contexto privado por conexión desde el Centro de conexiones.
- Intereses compartidos visibles para el usuario.
- Conexiones mutuas basadas en seguimiento recíproco.
- Misma zona solo cuando ambos perfiles muestran la misma ubicación.
- Actividad reciente limitada a publicaciones públicas, normales y publicadas.
- Ideas de conversación derivadas de contexto visible.
- Las ideas solo preparan un borrador en el chat; nunca se envían automáticamente.
- El usuario puede editar o borrar el borrador antes de enviar.
- Bloqueados y silenciados quedan fuera del contexto.
- Sin nuevas tablas ni perfilado adicional.
- Mobile-first.
- Sin monetización activa.


## V1.56.0 — Circle Sharing & Private Audiences

- Nuevas audiencias para publicaciones y Reels: Público, Solo conexiones, Círculos privados y VIP.
- Una publicación puede dirigirse a uno o varios círculos privados.
- Stories con las mismas audiencias privadas.
- La audiencia Solo conexiones exige seguimiento mutuo vigente.
- El acceso por círculos exige pertenecer al círculo y seguir siendo conexión mutua.
- Al quitar una persona del círculo o romper la conexión, pierde acceso inmediatamente.
- Publicaciones privadas no se pueden republicar.
- Publicaciones privadas no se pueden compartir a chats ni mediante enlaces externos.
- Las previsualizaciones públicas siguen limitadas a contenido Público.
- Menciones solo notifican a personas con acceso a la audiencia.
- Selector mobile-first de uno o varios círculos.
- VIP continúa separado y gratuito.
- Sin pagos, suscripciones ni paywalls comerciales.


## V1.57.0 — Close Connections

- Círculo privado fijo Cercanas.
- Solo el usuario puede ver quién está en Cercanas.
- Marcar/desmarcar desde perfiles y Centro de conexiones.
- Sin notificaciones al añadir o quitar.
- Feed Cercanas en Inicio.
- El feed solo incluye conexiones mutuas vigentes marcadas como Cercanas.
- Audiencia rápida Solo Cercanas para publicaciones, Reels y Stories.
- Internamente reutiliza el círculo privado fijo de V1.56.
- Cercanas no se puede renombrar ni eliminar.
- Al dejar de seguir o romper la conexión, la membresía de círculos se limpia.
- El acceso a contenido Cercanas se revoca dinámicamente al quitar la marca.
- Mobile-first.
- VIP continúa separado y gratis.
- Sin monetización.


## V1.58.0 — Social Communities

- Comunidades públicas y privadas.
- Nombre, descripción y avatar opcional.
- Roles Propietario / Administrador / Miembro.
- Solicitudes de acceso para comunidades privadas.
- Reglas propias, hasta 10 por comunidad.
- Publicaciones y comentarios dentro de cada comunidad.
- Fotos y vídeos con metadatos de reproducción preservados.
- Clasificación Normal / Sensible / Desnudez y gate +18 existente.
- La desnudez exige creador adulto verificado.
- Moderadores pueden retirar publicaciones, comentarios y miembros.
- El propietario puede promover/degradar administradores.
- Log privado de moderación.
- Chat de grupo opcional enlazado a la comunidad.
- Membresía y roles del chat se sincronizan con la comunidad.
- Los chats enlazados no permiten gestionar miembros desde Mensajes.
- Comunidades privadas muestran ficha/reglas, pero ocultan publicaciones y miembros hasta la aprobación.
- Bloqueos existentes se respetan en listados y contenido.
- Mobile-first.
- Sin monetización.


## V1.59.0 — Community Discovery

- Descubrimiento de comunidades separado del directorio general.
- Categorías de comunidad.
- Hasta 8 intereses por comunidad.
- Modos Recomendadas / Tus conexiones / Nuevas / Activas.
- Búsqueda por nombre, descripción o interés.
- Filtro por categoría.
- Recomendaciones explicables con motivo visible.
- Señales: intereses compartidos, conexiones que participan y actividad reciente.
- Sin ranking por engagement, rachas o presión artificial.
- Ocultar sugerencias de forma privada por usuario.
- Bloqueos y silencios respetados.
- Mobile-first.
- Sin monetización.


## V1.60.0 — Events & Meetups

- Eventos presenciales y online.
- Fecha/hora de inicio y fin opcional.
- Lugar presencial o enlace online según tipo.
- Audiencia Público / Conexiones / Círculos / Comunidad.
- Eventos de comunidad restringidos a propietarios y administradores.
- Respuestas Me interesa / Voy.
- Recordatorios opcionales activados con la respuesta.
- Worker de recordatorios integrado con Notifications + Web Push.
- Privacidad de asistentes: visible / solo quienes responden / solo creador.
- Cancelación por creador.
- Bloqueos y silencios respetados.
- Mobile-first.
- Sin monetización.


## V1.61.0 — Collaborative Posts

- Publicaciones y Reels con hasta 5 colaboradores.
- Invitaciones separadas del consentimiento de imagen.
- Aprobación previa antes de coautoría inicial.
- Colaboraciones aprobadas aparecen en el perfil de cada coautor.
- El feed Siguiendo reconoce también a los colaboradores.
- Gestión posterior: invitar, reinvitar o quitar colaboradores.
- El colaborador puede dejar una colaboración sin borrar ni ocultar el post original.
- El consentimiento de imagen mantiene su protección independiente.
- Posts privados conservan sus reglas de audiencia; ser colaborador no hace pública la publicación.
- Un colaborador no puede republicar como repost un contenido que ya aparece en su perfil como coautor.
- Notificaciones y centro de Consentimientos/Colaboraciones integrados.
- Compatible con publicaciones programadas y Reels.
- Mobile-first.
- Sin monetización.


## V1.62.0 — Advanced Mentions & Sharing

- Privacidad de menciones: todos / solo conexiones / nadie.
- Autocompletado de @usuario respetando privacidad, bloqueos y descubribilidad.
- Menciones a círculos privados sin exponer el nombre del círculo.
- Menciones dentro de comunidades y comentarios de comunidad.
- Compartir posts, Reels, Stories y perfiles en chats/grupos con validación de acceso de todos los miembros.
- Compartir posts/Reels públicos dentro de comunidades.
- Contexto opcional al compartir.
- Historial de compartidos privado para el usuario.
- Compartido externo solo para contenido público.
- Audiencias privadas protegidas de fugas.
- Mobile-first.
- Sin monetización.


## V1.63.0 — Community Moderation 3.0

- Rol Moderador separado de Administrador.
- Owner puede asignar Administrador / Moderador / Miembro.
- Moderadores pueden retirar posts y comentarios sin editar la comunidad.
- Cola privada de incidencias por comunidad.
- Informes sobre posts, comentarios y miembros.
- Reglas propias de comunidad conservadas como referencia de moderación.
- Avisos, silencios y suspensiones temporales de hasta 7 días.
- Las limitaciones bloquean posts, comentarios y compartidos dentro de la comunidad.
- Historial privado de acciones de moderación.
- Límite diario de incidencias por usuario.
- Detección de ráfagas de reportes sobre el mismo objetivo.
- Las señales coordinadas nunca sancionan automáticamente.
- Los reportes del mismo objetivo se cierran conjuntamente al resolver el incidente.
- Mobile-first.
- Sin monetización.


## V1.64.0 — Social Search 2.0

- Búsqueda global desde Explorar.
- Personas, posts, Reels, hashtags, comunidades y eventos.
- Filtros por tipo de resultado.
- Coincidencia textual y actualidad, sin ranking por likes/comentarios.
- Posts y Reels globales limitados a contenido público.
- Comunidades privadas solo si el usuario ya es miembro.
- Eventos respetan audiencia Público / Conexiones / Círculos / Comunidad.
- Bloqueos, silencios y discoverability respetados.
- Historial opcional, guardado solo en localStorage del dispositivo.
- Historial desactivado por defecto y borrable por el usuario.
- Mobile-first.
- Sin monetización.


## V1.65.0 — Relationship Intelligence

- Sugerencias explicables dentro del Centro de conexiones.
- Intereses fuertes compartidos.
- Comunidades compartidas.
- Conversaciones que quizá quieras retomar usando solo fecha y volumen, nunca cuerpos de mensajes.
- Señal de interacción habitual por likes/comentarios agregados.
- Actividad reciente solo cuando show_activity lo permite.
- Acciones Ver contexto / Retomar chat, sin envío automático.
- Ocultar sugerencias de forma privada.
- Bloqueos y silencios respetados.
- Sin rachas, FOMO, urgencia ni presión artificial.
- Mobile-first.
- Sin monetización.


## V1.66.0 — Growth & Onboarding 2.0

- Enlaces personales de invitación con token opaco, manteniendo compatibilidad con `?ref=usuario`.
- Vista segura del invitador en la landing de registro.
- Métricas de aperturas y altas atribuidas por enlace.
- Registro atribuido por token nuevo o referencia legacy.
- Onboarding social ampliado con una comunidad como paso recomendado.
- Personas sugeridas para empezar a construir red, respetando bloqueos, silencios y discoverability.
- Límites específicos anti-abuso para registro e inicio de sesión.
- Sin mensajes automáticos, presión, rachas ni incentivos artificiales.
- Mobile-first.
- Sin monetización.


## V1.67.0 — Accessibility & UX Quality 2.0

- Enlaces “Saltar al contenido principal” en landing y aplicación.
- Navegaciones principal y móvil etiquetadas para tecnologías de asistencia.
- Estado de sección actual con `aria-current`.
- Cambios de sección y avisos anunciados mediante regiones `aria-live`.
- Modales convertidos dinámicamente en diálogos accesibles con nombre semántico.
- Gestión y restauración del foco al abrir/cerrar diálogos.
- Foco atrapado dentro del modal para navegación por teclado.
- Cierre de diálogos con Escape.
- Stories navegables con flechas izquierda/derecha cuando el visor está abierto.
- Foco visible consistente en enlaces, botones, formularios y controles.
- Objetivos táctiles reforzados en dispositivos táctiles.
- Soporte para `prefers-reduced-motion` y Forced Colors.
- Formularios de registro/login con labels accesibles y autocomplete.
- Mobile-first.
- Sin monetización.


## V1.68.0 — Performance & Reliability 2.0

- Timeout de 15 segundos para peticiones API del cliente.
- Un reintento automático y corto para GET ante fallos de red y respuestas 502/503/504.
- Deduplicación de peticiones GET simultáneas a la misma URL.
- Protección del feed contra respuestas fuera de orden al cambiar rápidamente de pestaña.
- Conservación del feed anterior si una actualización falla.
- Avatares dinámicos con carga diferida y decodificación asíncrona.
- Service Worker con timeout de red antes de usar el fallback cacheado.
- Pool PostgreSQL endurecido con máximo de conexiones, timeout de conexión e idle timeout configurables.
- Índices idempotentes para likes por publicación, seguidores inversos, bloqueos inversos y posts publicados recientes.
- Nuevo endpoint `/api/ready` que verifica disponibilidad real de PostgreSQL.
- Registro de peticiones API lentas a partir de 1,5 segundos, sin guardar cuerpos ni datos privados.
- Apagado limpio del servidor HTTP y del pool PostgreSQL ante SIGTERM/SIGINT.
- Timeouts HTTP explícitos para conexiones persistentes.
- Variables opcionales: `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS` y `DB_CONNECT_TIMEOUT_MS`.
- Mobile-first.
- Sin monetización.


## V1.69.0 — Mobile UX Final Polish 3.0

- Navegación inferior refinada con safe areas laterales e inferiores.
- Espacio de contenido unificado para evitar que el dock tape acciones o contenido.
- Modales móviles consolidados como bottom sheets con altura dinámica y overscroll controlado.
- Formularios móviles con campos de 16 px y controles de 48 px para evitar zoom accidental y mejorar uso táctil.
- Filtros y pestañas horizontales desplazables de forma consistente en feed, actividad, mensajes, perfil y búsqueda.
- Bandeja de mensajes reorganizada a una sola columna en móvil.
- Estados de error reutilizables con botón Reintentar en feed, notificaciones y conversaciones.
- El feed conserva contenido previo si una recarga falla.
- Feedback de carga mediante aria-busy en listas principales.
- Ajustes de safe area también en portada, registro, acceso y footer.
- Mobile-first.
- Sin monetización.


## V1.70.0 — Product Maturity & Launch Readiness

- `/api/health` ampliado con versión, uptime, entorno y estado seguro de configuración.
- `/api/ready` valida configuración crítica y conexión real con PostgreSQL.
- Request ID por petición mediante `X-Request-Id` para facilitar diagnóstico.
- Respuestas API con `Cache-Control: no-store`.
- Rutas API inexistentes devuelven 404 JSON en lugar de caer en la landing HTML.
- Errores API no controlados devuelven un envelope seguro con request ID, sin exponer stack ni datos internos.
- Validación de `DATABASE_URL` y `JWT_SECRET`; avisos seguros para HTTPS, cookies y almacenamiento persistente.
- HTML principal servido con revalidación para reducir riesgo de shells obsoletos tras despliegues.
- Nuevo comando `npm run check:syntax`.
- Coolify actualizado para usar `/api/ready` como healthcheck.
- Plantilla de variables de entorno sin secretos.
- Checklist de lanzamiento, rollback y smoke tests.
- Mobile-first.
- Sin monetización.


## V1.71.0 — Beta Launch & Real User Operations

- Consola beta dentro del panel administrativo.
- Métricas agregadas de altas de 24 h y 7 días.
- Activación de nuevos usuarios calculada con acciones sociales reales ya existentes: publicar, comentar, seguir o enviar un mensaje.
- Usuarios con actividad social agregada durante los últimos 7 días.
- Volumen de posts, mensajes, follows y denuncias en 24 horas.
- Sin píxeles, SDKs analíticos ni tracking externo.
- Sin lectura ni análisis del cuerpo de los mensajes.
- Estado de health/readiness visible desde administración.
- Registro privado de incidencias operativas con severidad Informativa / Atención / Crítica.
- Estados de incidencia Abierta / En seguimiento / Resuelta, con reapertura y notas.
- Índices PostgreSQL para que las métricas agregadas no penalicen la carga habitual.
- `npm run check:syntax` ampliado para incluir rutas y frontend de administración.
- Mobile-first también para el panel operativo.
- Sin monetización.


## V1.72.0 — Beta Feedback & Support Center

- Centro de ayuda y feedback dentro de la aplicación.
- Acceso desde escritorio y desde el perfil móvil.
- Envíos clasificados como Problema / Sugerencia / Duda.
- Historial propio con estados Recibido / En revisión / Resuelto.
- Nota o respuesta administrativa visible para el usuario.
- Contexto técnico limitado a sección, ruta, clase de pantalla, conexión y versión.
- Sin adjuntar contenido de mensajes privados, publicaciones, archivos ni datos de terceros.
- Límite anti-spam de 5 envíos por usuario y hora.
- Cola administrativa de soporte separada de las denuncias de moderación.
- Filtros por tipo y estado.
- Flujo administrativo revisar / resolver / reabrir.
- Request ID guardado para correlacionar incidencias técnicas con logs cuando sea necesario.
- Índices PostgreSQL para historial de usuario y cola administrativa.
- Mobile-first.
- Sin tracking externo.
- Sin monetización.


## V1.73.0 — Beta Cohorts & Release Control

- Cohortes beta administrables desde el panel.
- Alta y retirada de usuarios por `@usuario`.
- Cohortes pausables sin borrar miembros.
- Registro genérico de funciones beta mediante feature keys.
- Tres modos efectivos por función: apagada globalmente, disponible para todos o limitada a cohortes.
- Kill switch administrativo sin necesidad de redeploy.
- Evaluación por usuario en `/api/release/me`.
- Los clientes reciben solo el estado efectivo de sus funciones.
- El Centro de soporte V1.72 queda integrado como primera función controlada (`support_center`).
- El kill switch del soporte se vuelve a consultar al abrir la herramienta, no solo al iniciar sesión.
- Backend del soporte protegido por el mismo feature gate.
- Asignación de una o varias cohortes a cada función.
- Índices PostgreSQL para evaluación por usuario.
- Base reutilizable para próximas funciones experimentales.
- Mobile-first.
- Sin monetización.


## V1.74.0 — Release Audit & Safe Rollback

- Historial de cambios de release control con administrador, fecha y request ID.
- Snapshot completo Antes / Después para cambios restaurables.
- Auditoría de cambios de feature, kill switch, modo global/cohortes, asignaciones, estado de cohorte y miembros.
- Las creaciones nuevas quedan auditadas, pero no se eliminan automáticamente mediante rollback.
- Rollback transaccional de configuración anterior.
- Protección contra sobrescritura: el rollback solo se ejecuta si el estado actual coincide con el estado posterior del cambio elegido.
- Respuesta `rollback_conflict` cuando existen cambios posteriores incompatibles.
- Restauración de feature flags junto con sus cohortes asignadas.
- Restauración de cohortes junto con su estado y lista de miembros existentes.
- El rollback genera a su vez una nueva entrada de auditoría y marca la entrada restaurada.
- Historial visible desde la consola Release Control.
- Request ID reutilizado para correlacionar cambios administrativos con logs operativos.
- Mobile-first en administración.
- Sin monetización.


## V1.75.0 — Controlled Rollout Waves & Beta Graduation

- Despliegue progresivo por porcentaje estable de usuarios.
- Asignación determinista mediante hash de `feature_key + user_id`: el mismo usuario permanece en la misma ola sin tracking adicional.
- Las cohortes explícitas siguen teniendo acceso aunque una ola porcentual sea pequeña.
- Kill switch global sigue teniendo prioridad absoluta.
- Fases operativas: Solo cohortes / Piloto / Beta ampliada / Graduada.
- Olas predefinidas en administración: 5%, 10%, 25%, 50%, 75% y 100%.
- Graduar una función a 100% la deja disponible para todos.
- Congelar expansión impide cambiar de ola, pero mantiene el acceso actual.
- El kill switch continúa funcionando incluso con la expansión congelada.
- Nota o criterio de avance guardado por feature.
- Cambios de ola y congelado entran en la auditoría V1.74 con snapshots Antes / Después.
- Rollback seguro puede restaurar una ola anterior y sus parámetros.
- Las funciones globales existentes migran automáticamente a estado Graduada 100%.
- Sin SDK analítico ni persistencia de quién cae en cada porcentaje.
- Mobile-first en el panel administrativo.
- Sin monetización.


## V1.75.1 — Message + Profile UI Hotfix

- La paleta completa de reacciones deja de mostrarse permanentemente bajo cada mensaje.
- En mensajes recibidos aparece una acción compacta **Reaccionar** que despliega la paleta solo cuando se necesita.
- Los mensajes enviados no muestran la paleta de reacción.
- Las reacciones ya existentes se muestran como un resumen compacto con contador.
- La cabecera del perfil propio en escritorio pasa a una disposición vertical más limpia: identidad primero y acciones debajo.
- La cabecera móvil no se modifica.
- PWA cache actualizado para evitar servir CSS/JS anterior tras el redeploy.


## V1.75.2 — Reply + Profile Layer Hotfix

- Al responder a un mensaje propio, el compositor muestra **RESPONDIENDO A ti** en lugar de **RESPONDIENDO A Tú**.
- El perfil propio en escritorio aplica el mismo orden de capas seguro que móvil.
- La portada queda detrás del cuerpo del perfil y del avatar.
- La foto de perfil se muestra completa sobre el borde inferior de la portada.
- Móvil permanece sin cambios.
- Caché PWA actualizada.


## V1.75.3 — Message Own Actions Hotfix

- Los mensajes enviados por ti dejan de mostrar **Responder** y **Reaccionar**.
- Los mensajes recibidos mantienen **Responder + Reaccionar**.
- Las reacciones ya existentes sobre mensajes propios siguen mostrándose como resumen compacto.
- Sin cambios en móvil/escritorio fuera del chat.
- Caché PWA actualizada.


## V1.76.0 — Production Domain & Public Launch Polish

- `https://redlibertad.com` queda como origen público canónico mediante `APP_ORIGIN`.
- Nuevo `/api/public-config` para que el cliente conozca el origen público efectivo sin hardcodear la URL temporal.
- Invitaciones, posts, perfiles y Stories compartidos usan siempre el origen canónico aunque el usuario haya entrado por una URL técnica.
- La portada incluye canonical, Open Graph completo, Twitter Cards y URL/imagen absolutas.
- Las páginas públicas `/p/:id` incluyen canonical y `og:site_name`.
- Posts públicos sensibles quedan con `noindex,nofollow` aunque mantengan una vista externa protegida.
- Nuevo `/robots.txt` que permite portada/posts públicos y bloquea app privada, admin, API y uploads.
- Nuevo `/sitemap.xml` dinámico con portada y hasta 10.000 posts públicos normales; no incluye contenido sensible.
- Manifest PWA con `id=/app` y `lang=es` para mantener una identidad estable tras el cambio de dominio.
- Caché PWA V1.76 actualizada.
- Compatible con el dominio temporal como respaldo técnico, sin publicarlo en enlaces externos.
- Sin monetización.


## V1.77.0 — Public Profiles & Profile SEO

- Nueva URL pública limpia de perfil: `/perfil/:username`.
- Compartir un perfil desde la app usa `https://redlibertad.com/perfil/usuario` en lugar de un deep link interno.
- Cada perfil público incluye title, description, canonical, Open Graph y Twitter Cards.
- Structured Data `Person` para perfiles indexables.
- La página pública muestra identidad, avatar, portada, bio, headline de creador y contadores públicos básicos.
- `discoverable=true` controla la indexación SEO: solo esos perfiles reciben `index,follow`.
- Perfiles no descubribles siguen accesibles por enlace directo, pero quedan `noindex,nofollow`.
- Administradores y cuentas inactivas no tienen página pública indexable.
- Nuevo `/sitemap-profiles.xml` con hasta 10.000 perfiles activos y descubribles.
- `robots.txt` anuncia el sitemap de perfiles y permite `/perfil/`.
- Índice PostgreSQL específico para el sitemap/perfiles SEO.
- Sin monetización.


## V1.78.0 — Public Discovery & SEO Hub

- Nuevo directorio público `/perfiles`.
- Solo incluye cuentas activas, no-admin y con `discoverable=true`.
- 24 perfiles por página con paginación server-rendered.
- Búsqueda pública por nombre, usuario, bio y headline de creador.
- Las búsquedas con `?q=` quedan `noindex,follow` para evitar indexar páginas internas de resultados.
- Páginas normales del directorio quedan indexables y con canonical por página.
- Prioridad visual a perfiles creador-verificado, seguida de seguidores, publicaciones públicas y actividad reciente.
- Structured Data `ItemList` en la primera página del directorio.
- Enlazado interno desde la landing a **Personas** y desde cada perfil público al directorio.
- Nuevo `/sitemap-index.xml` que referencia posts y perfiles.
- `robots.txt` anuncia el sitemap índice y mantiene los sitemaps individuales por compatibilidad.
- `/perfiles` se incluye en el sitemap principal.
- Mobile-first.
- Sin monetización.


## V1.79.0 — Public Content Discovery & SEO

- Nuevo directorio público `/publicaciones`.
- Solo aparecen posts publicados, de audiencia pública, contenido normal y autores activos/no-admin con `discoverable=true`.
- 24 publicaciones por página con paginación server-rendered.
- Búsqueda pública por texto, nombre visible o usuario.
- Las búsquedas `?q=` quedan `noindex,follow`.
- Hashtags públicos navegables mediante `/hashtag/:tag`.
- Hashtags con menos de 2 publicaciones quedan `noindex,follow` para evitar páginas SEO débiles.
- Hashtags destacados calculados únicamente sobre contenido público normal de autores descubribles.
- Nuevo `/sitemap-hashtags.xml` con hashtags que tienen al menos 2 publicaciones públicas elegibles.
- `/sitemap-index.xml` incorpora el sitemap de hashtags.
- `/publicaciones` entra en el sitemap principal.
- Los posts de autores `discoverable=false` siguen accesibles por enlace directo si son públicos, pero quedan `noindex,nofollow` y fuera de los sitemaps.
- Posts sensibles continúan fuera del descubrimiento público y de todos los sitemaps.
- Structured Data `ItemList` en la primera página del hub y de hashtags indexables.
- Enlazado interno entre portada, perfiles, directorio de personas y publicaciones públicas.
- Índice PostgreSQL para posts públicos normales.
- Mobile-first.
- Sin monetización.


## V1.80.0 — Public Communities & Community SEO

- Nuevo directorio público `/comunidades`.
- Solo aparecen comunidades públicas cuyo propietario está activo, no es administrador y mantiene `discoverable=true`.
- 24 comunidades por página con búsqueda por nombre, descripción, categoría e intereses.
- Las búsquedas con `?q=` quedan `noindex,follow`.
- Nueva ficha pública canónica `/comunidad/:id/:slug` con redirección 301 desde slugs ausentes o antiguos.
- La ficha muestra descripción, categoría, intereses, reglas, contadores y publicaciones recientes elegibles.
- Las publicaciones visibles fuera de la app quedan limitadas a contenido `normal`, publicado y creado por perfiles activos, no-admin y descubribles.
- Comunidades privadas nunca aparecen en el directorio, páginas públicas ni sitemap.
- Si el propietario de una comunidad pública deja de ser descubrible, la comunidad desaparece del directorio y sitemap; un acceso directo queda `noindex,nofollow`.
- Nuevo `/sitemap-communities.xml` e integración en `/sitemap-index.xml`.
- `/comunidades` se incorpora al sitemap principal y a la navegación pública.
- Structured Data `ItemList` para el directorio y `CollectionPage` para fichas indexables.
- Índices PostgreSQL específicos para descubrimiento público de comunidades y posts normales.
- Mobile-first.
- Sin monetización.


## V1.81.0 — Public Events & Event SEO

- Nuevo directorio público `/eventos` para próximos eventos.
- Solo se exponen eventos con `visibility='public'`, no cancelados y creados por perfiles activos, no-admin y descubribles.
- Un evento asociado a una comunidad solo puede entrar en la capa pública si esa comunidad también es pública y su propietario sigue siendo elegible.
- Búsqueda por título, descripción, lugar y creador.
- Filtro por evento presencial u online.
- Búsquedas y filtros quedan `noindex,follow`; las páginas naturales del directorio son indexables.
- Nueva URL canónica `/evento/:id/:slug` con redirección 301 desde slugs ausentes o antiguos.
- Cada evento público incluye title, description, canonical, Open Graph y structured data `Event`.
- Para eventos online no se expone `online_url`; el acceso real solo se muestra dentro de la aplicación autenticada.
- No se publican identidades de asistentes.
- Las cifras de asistentes/interesados solo se muestran si `attendee_visibility='public'`.
- Eventos de conexiones, círculos o comunidades privadas nunca aparecen en páginas públicas ni sitemaps.
- Eventos cancelados quedan fuera de la capa pública.
- Eventos antiguos permanecen accesibles por URL pública si siguen siendo públicos, pero pasan a `noindex,follow` tras 30 días.
- Nuevo `/sitemap-events.xml` con eventos públicos próximos elegibles.
- Integración en `/sitemap-index.xml`, `/sitemap.xml`, `robots.txt` y navegación pública.
- Índices PostgreSQL específicos para eventos públicos.
- Mobile-first.
- Sin monetización.


## V1.81.2 — Admin Public Events Visibility Hotfix

- Los eventos con `visibility='public'` creados por una cuenta administradora pueden aparecer en `/eventos` si esa cuenta está activa y mantiene `discoverable=true`.
- Los administradores siguen excluidos del directorio público de personas `/perfiles`.
- No cambia la privacidad de eventos `connections`, `circles` o `community`.
- Un evento ligado a una comunidad sigue exigiendo que esa comunidad sea pública y elegible.
- Mantiene fuera del sitemap los eventos cancelados o no públicos.


## V1.82.0 — Public Reels & Media Discovery SEO

- Nuevo directorio público `/reels` para Reels normales de audiencia pública.
- Nuevo directorio público `/multimedia` para fotos y vídeos públicos.
- Solo aparecen contenidos `published`, `audience='public'`, `content_level='normal'`, con media real y autores activos, no-admin y `discoverable=true`.
- Búsqueda por texto, nombre y usuario.
- `/multimedia` permite filtrar Fotos / Vídeos.
- Búsquedas y filtros quedan `noindex,follow` para evitar duplicidad SEO.
- Nueva ficha canónica `/reel/:id/:slug` con redirección 301 desde slug ausente o antiguo.
- Structured Data `VideoObject` en cada Reel público elegible.
- Métricas agregadas públicas: vistas, likes, comentarios y republicaciones.
- Nuevo `/sitemap-reels.xml`.
- Integración de Reels en sitemap index, sitemap principal, robots y navegación pública.
- `/multimedia` se incorpora al sitemap principal.
- Contenido sensible, desnudez y audiencias VIP/conexiones/círculos quedan completamente fuera.
- Los administradores continúan fuera de los directorios públicos de contenido visual.
- No se modifica la API interna de Reels ni el algoritmo autenticado.
- Índices PostgreSQL específicos para descubrimiento visual.
- Mobile-first.
- Sin monetización.


## V1.83.0 — Public Search & Unified Discovery

- Nuevo buscador público unificado en `/buscar`.
- Busca Personas, Publicaciones, Reels, Hashtags, Comunidades y Eventos desde una sola pantalla.
- La portada `/buscar` es indexable; cualquier consulta `?q=` queda `noindex,follow`.
- Los resultados enlazan únicamente a URLs públicas canónicas ya existentes.
- Personas: solo perfiles activos, no-admin y `discoverable=true`.
- Publicaciones/Reels: solo `published`, `audience='public'`, `content_level='normal'` y autores públicos elegibles.
- Comunidades: solo comunidades públicas de propietarios activos, no-admin y descubribles.
- Eventos: solo eventos públicos, no cancelados y compatibles con las reglas públicas de comunidad.
- Hashtags se extraen exclusivamente de publicaciones públicas normales elegibles.
- Límite pequeño por categoría para proteger rendimiento.
- Integración en navegación pública, robots y sitemap principal.
- No modifica el buscador autenticado ni sus reglas privadas.
- Sin migraciones de base de datos.
- Mobile-first.
- Sin monetización.


## V1.83.1 — Desktop Search Layout Polish

- Corrige la colisión entre la clase local del buscador y la clase global `.hero`, que en escritorio heredaba `min-height: calc(100vh - 78px)` y padding de la landing.
- El bloque principal de `/buscar` usa ahora una clase aislada `.search-hero`.
- La navegación pública del buscador deja de heredar `min-width:160px` por botón en escritorio.
- Los botones de la cabecera quedan en una sola fila cuando hay espacio suficiente.
- Las reglas móviles existentes se mantienen sin cambios funcionales.


## V1.84.0 — Public Discovery Hub & Trending

- Nuevo hub público `/descubrir`.
- Reúne Personas nuevas, Publicaciones destacadas, Reels, Hashtags, Comunidades activas y Próximos eventos.
- Todas las secciones reutilizan las reglas públicas ya validadas:
  - perfiles activos, no-admin y `discoverable=true`,
  - publicaciones/Reels `published`, `audience='public'`, `content_level='normal'`,
  - comunidades `privacy='public'`,
  - eventos `visibility='public'`, no cancelados y con comunidad pública cuando aplica.
- Tendencias calculadas solo con señales agregadas públicas y ventanas recientes.
- `/descubrir` es indexable y usa `CollectionPage` structured data.
- Incluye acceso directo al buscador público.
- La portada enlaza a Descubrir sustituyendo el enlace secundario "Qué es", sin aumentar el número de elementos del menú.
- `/buscar` enlaza al nuevo hub desde su estado inicial.
- Integración en robots y sitemap principal.
- Sin cambios en `posts.js`, APIs privadas o base de datos.
- Mobile-first.
- Sin monetización.


## V1.85.0 — Public Topics & Interest Hubs

- Nuevo directorio público `/temas`.
- Nuevas páginas canónicas `/tema/:slug` para los 12 intereses de perfil existentes:
  Arte, Fotografía, Naturismo, Moda, Fitness, Viajes, Música, Lifestyle, Belleza, Creatividad, Tecnología y Bienestar.
- Cada tema reúne:
  - personas públicas con ese interés,
  - comunidades públicas con ese interés,
  - publicaciones/Reels públicos normales que usan el hashtag relacionado.
- Las páginas con menos de 2 señales públicas quedan `noindex,follow` para evitar thin content.
- Solo temas con al menos 2 señales públicas entran en `/sitemap-topics.xml`.
- `/temas` usa `ItemList`; cada tema indexable usa `CollectionPage`.
- `/buscar` incorpora categoría Temas y enlaza a las páginas canónicas.
- `/descubrir` incorpora acceso directo a Temas.
- La barra superior no gana nuevos botones.
- No se usa `location_label` ni ubicación en esta fase.
- Sin migraciones de base de datos.
- Sin tocar `posts.js` ni APIs privadas.
- Mobile-first.
- Sin monetización.


## V1.86.0 — Public Story Sharing & Ephemeral Discovery

- Nuevo directorio público efímero `/historias`.
- Nuevo enlace compartible `/historia/:id`.
- Fuera de la app solo se muestran Stories:
  - activas,
  - `audience='public'`,
  - `moderation_status='published'`,
  - `content_level='normal'`,
  - de autores activos, no-admin y `discoverable=true`.
- Stories sensibles, nudity, VIP, connections y circles nunca se exponen.
- Al caducar una Story, su enlace deja de mostrar el media y responde HTTP 410 con una pantalla de historia finalizada.
- Las páginas de Stories usan `noindex,follow`; no se añaden a sitemaps.
- Las visitas anónimas no se insertan en `story_views` ni alteran las métricas internas.
- Soporte de imagen y vídeo, usando `playback_url` cuando existe para vídeo.
- Open Graph efímero para facilitar compartir el enlace mientras está activo.
- Acceso desde `/descubrir`.
- Sin cambios en `src/routes/stories.js`, `public/social.js` ni `posts.js`.
- Sin migraciones de base de datos.
- Mobile-first.
- Sin monetización.


## V1.87.0 — Public Share & Social Preview Polish

- Nuevo helper compartido `/public-share-v187.js`.
- Añade Compartir nativo con `navigator.share` en dispositivos compatibles.
- Fallback automático a copiar el enlace canónico cuando no existe share nativo.
- Botón Compartir en:
  - perfil público,
  - publicación pública,
  - comunidad pública,
  - evento público,
  - Reel público,
  - página de tema,
  - Story pública activa.
- Las publicaciones públicas normales con imagen usan esa imagen como `og:image` cuando el autor es descubrible y no-admin.
- Las comunidades públicas elegibles usan su avatar como preview social cuando existe.
- Reels y Stories conservan soporte de `og:video`.
- Se normalizan `twitter:title`, `twitter:description` y `twitter:image` en Comunidad, Evento, Reel, Tema y Story.
- Los enlaces compartidos usan siempre la URL canónica de la página.
- No se altera contenido privado, sensible, nudity, VIP, connections o circles.
- Sin migraciones de base de datos.
- Sin cambios en las APIs privadas.
- Mobile-first.
- Sin monetización.


## V1.88.0 — Public Entry & Signup Attribution

- Las páginas públicas canónicas pasan un origen interno seguro al registro/login.
- Tipos admitidos: Perfil, Publicación, Comunidad, Evento, Reel, Tema e Historia.
- La landing conserva el origen en `sessionStorage` mientras la persona completa acceso o registro.
- Tras crear cuenta o iniciar sesión se vuelve a la URL pública canónica desde la que llegó.
- El backend valida tipo, identificador y ruta antes de aceptar el retorno.
- No se aceptan URLs externas, rutas `//` ni redirecciones abiertas.
- Nueva tabla `signup_attributions`:
  - `user_id`,
  - `source_type`,
  - `source_key`,
  - `source_path`,
  - `created_at`.
- La atribución se inserta dentro de la misma transacción que crea el usuario.
- Las invitaciones/referrals siguen funcionando de forma independiente y compatible.
- No se guarda referrer externo, URL externa ni información adicional de navegación.
- CTAs atribuidos en Perfil, Publicación, Comunidad, Evento, Reel, Tema e Historia.
- `auth.js` entra en `check:syntax`.
- Sin monetización.


## V1.89.0 — Growth Attribution Dashboard

- Nuevo panel administrativo "Origen de altas".
- Ventanas de 7 y 30 días.
- Métricas:
  - nuevas cuentas,
  - altas con origen público,
  - tasa de atribución,
  - altas atribuidas que se activaron,
  - tasa de activación atribuida,
  - altas con invitación.
- Distribución por tipo de origen:
  Perfil, Publicación, Comunidad, Evento, Reel, Tema e Historia.
- Ranking de hasta 25 orígenes concretos que más registros generan.
- Enlace directo para abrir el origen público cuando siga disponible.
- Evolución diaria visual de altas atribuidas.
- Activación calculada con señales sociales existentes: publicar, comentar, seguir o enviar mensaje después del alta.
- "Con invitación" se muestra como señal independiente y puede solaparse con una alta atribuida públicamente.
- Datos disponibles desde V1.88; no se reconstruye atribución anterior.
- Endpoint `/api/admin/growth-attribution` protegido por `requireAdmin`.
- No muestra email, IP, mensajes ni datos privados de las cuentas registradas.
- Sin tracking externo.
- Sin monetización.


## V1.89.1 — Verification Independence & Revoke

- Verificación +18 y verificación de creador quedan totalmente separadas.
- Aprobar "Creador" ya no activa `age_verified`.
- Aprobar "+18" ya no altera `creator_verified`.
- Las solicitudes pendientes se aprueban únicamente por su propio tipo.
- Nuevas acciones administrativas:
  - `Quitar +18`,
  - `Quitar creador`.
- Revocar una verificación no modifica la otra.
- Cada revocación queda registrada en Historial de moderación.
- El usuario recibe una notificación cuando se aprueba o retira una verificación.
- Una solicitud antigua puede seguir figurando como aprobada, pero si la insignia se retiró el panel muestra "Verificación actual retirada".
- Confirmación antes de revocar desde Administración.
- Hotfix montado antes del router admin existente para aislar el cambio.
- Sin migraciones.


## V1.90.0 — SEO Crawl Health & Canonical Cleanup

- Nuevo panel administrativo "SEO · Google — Salud de rastreo e indexación".
- Nuevo endpoint admin-only `/api/admin/seo-health`.
- Recuento estimado de URLs indexables por:
  - perfiles,
  - publicaciones,
  - Reels,
  - hashtags,
  - comunidades,
  - eventos,
  - temas.
- Estado y acceso directo a cada sitemap público.
- Resumen de contenido protegido que no debe indexarse:
  sensible, audiencias privadas, autores ocultos y eventos admin.
- Alertas cuando una familia de sitemap está vacía.
- El panel distingue preparación interna de RedLibertad de la indexación real de Google Search Console.
- Canonical cleanup de Reels:
  - un Reel público normal usa como URL SEO única `/reel/:id/:slug`,
  - `/p/:id` redirige 301 a la URL del Reel cuando corresponde,
  - el sitemap principal excluye `post_kind='reel'`,
  - `/sitemap-reels.xml` queda como sitemap específico.
- Consistencia de privacidad en Eventos:
  las cuentas admin quedan excluidas de página pública/listado SEO, Buscar y Descubrir.
- Stories siguen noindex y fuera de sitemaps.
- Las búsquedas con consulta siguen noindex.
- Sin integración API de Search Console ni tracking externo.
- Sin migraciones de base de datos.
- Sin monetización.


## V1.90.1 — SEO Canonical Links Hotfix

- Hotfix sobre V1.90.0 ya presente en `main`.
- Los listados públicos de `/publicaciones` y `/hashtag/:tag` enlazan los Reels directamente a `/reel/:id/:slug`.
- El JSON-LD `ItemList` usa también la URL canonical de Reel.
- Se mantiene el 301 desde `/p/:id` como compatibilidad para enlaces antiguos.
- Sin cambios en `src/routes/posts.js`, feed, privacidad, base de datos o monetización.


## V1.90.2 — Mobile Profile Declutter

- Simplifica el perfil propio, especialmente en móvil.
- Acciones principales visibles: Editar perfil, Compartir y Más.
- Confianza, Privacidad, Cuenta, Ayuda y Contenido sensible pasan al menú Más.
- Centro de creador se mantiene visible como acceso destacado independiente para creadores verificados.
- El menú Más conserva las funciones y endpoints existentes; solo cambia su presentación.
- El control de contenido sensible mantiene exactamente la misma lógica.
- Sin cambios de backend funcional, privacidad, permisos o base de datos.
- Sin cambios en `src/routes/posts.js`.
- Sin monetización.


## V1.90.3 — Profile Visual Polish

- Pulido visual del perfil propio sobre V1.90.2.
- Centro de creador más compacto, con flecha alineada a la derecha.
- Botón Más con chevrón integrado en la misma línea.
- Estadísticas móviles en una sola fila de cuatro columnas.
- Se retira del pie del perfil el texto redundante de estado +18/creador; esa información sigue disponible en Confianza.
- Sin cambios de lógica, permisos, privacidad ni base de datos.
- Sin cambios en `src/routes/posts.js`.
- Sin monetización.


## V1.90.3.1 — Profile More Menu Hotfix

- Corrige el menú Más del perfil propio detectado tras V1.90.3.
- El menú deja de ser flotante y se despliega dentro del flujo del perfil.
- Al abrir Más, Centro de creador, biografía y estadísticas se desplazan hacia abajo en lugar de quedar tapados.
- El panel deja de cortarse en móvil y conserva las cinco opciones existentes.
- Mantiene los mismos modales, permisos y endpoints.
- Sin cambios en `src/routes/posts.js`, base de datos o monetización.


## V1.91.0 — Public Entry Conversion & Safe Return

- Unifica los CTA de entrada en superficies públicas clave.
- Post, Perfil, Reel, Tema y Story ofrecen ahora dos caminos claros:
  - Crear cuenta para participar.
  - Entrar y volver al contenido exacto.
- Comunidad y Evento ya tenían este flujo y se mantienen sin cambios.
- Se reutiliza la atribución propia existente con `entry`, `entryKey` y `next`.
- No se añaden trackers externos ni cookies de marketing.
- El retorno tras registro/login sigue pasando por el flujo seguro existente.
- Sin migraciones y sin monetización.


## V1.92.0 — Mobile Public Entry Bar

- Añade una barra inferior de conversión únicamente en móvil para páginas públicas de detalle.
- Disponible en Post, Perfil, Comunidad, Evento, Reel, Tema y Story activa.
- Acciones compactas: **Crear cuenta** y **Entrar**.
- Ambos botones reutilizan el contexto seguro de V1.91 y regresan al contenido exacto.
- Los CTA equivalentes dentro del contenido se ocultan solo en móvil para evitar duplicados.
- En escritorio se mantiene la presentación de V1.91.
- Incluye safe-area inferior para iPhone/PWA y espacio de compensación para no tapar contenido.
- Sin tracking nuevo, sin cookies de marketing y sin monetización.
- Sin cambios en privacidad, indexación o base de datos.


## V1.92.1 — Public Mobile Visual Polish

- Pulido visual de superficies públicas detectado tras V1.92.0.
- Detalle público de publicación:
  - elimina el centrado vertical y el gran espacio vacío;
  - añade cabecera compacta de RedLibertad / Contenido público;
  - muestra avatar real del autor cuando existe;
  - añade fecha y badge de creador;
  - posts solo de texto reciben una tarjeta protagonista con identidad de marca;
  - CTA de participación y acciones secundarias más ordenadas;
  - mantiene la barra móvil Crear cuenta / Entrar de V1.92.
- Reels y Multimedia:
  - cabecera móvil de una sola línea: marca + Crear cuenta;
  - oculta navegación secundaria de cabecera en móvil;
  - estado vacío más cuidado y con acciones útiles;
  - desaparece “0 resultados públicos” cuando no aporta información;
  - no se muestra “Página 1 de 1” cuando no existe paginación real.
- Sin cambios en SEO, privacidad, canonical, robots, sitemaps ni lógica de contenido.
- Sin migraciones y sin monetización.


## V1.92.2 — Social Share Preview Polish

- Nueva imagen social de marca para enlaces compartidos: `/assets/og-redlibertad-v1922.jpg`.
- Formato 1200×630 preparado para WhatsApp, Facebook, X y otras plataformas que leen Open Graph.
- Diseño más llamativo con:
  - identidad azul marino / teal / coral,
  - logo gráfico de RedLibertad,
  - mensaje “La libertad es lo primero”,
  - “Publica · Conecta · Comparte”,
  - CTA visual “Únete a la conversación”,
  - dominio redlibertad.com.
- Todas las referencias públicas que usaban la imagen genérica pasan al archivo versionado.
- El nombre de archivo nuevo fuerza una URL de imagen distinta para reducir problemas con cachés de previews sociales.
- Los posts/perfiles/comunidades que ya usan una imagen pública real conservan esa imagen cuando corresponde.
- Sin cambios en privacidad, SEO indexable, canonical, sitemaps o lógica de compartir.
- Sin migraciones y sin monetización.


## V1.93.0 — Public Social Proof & Related Discovery

- Mejora la continuidad de navegación desde páginas públicas.
- Publicación pública:
  - muestra cifras agregadas de Me gusta, Comentarios y Republicaciones;
  - no muestra identidades de usuarios;
  - no muestra esos contadores en contenido sensible/protegido;
  - añade hasta 3 contenidos públicos normales del mismo creador;
  - enlaza Reels relacionados directamente a su canonical `/reel/:id/:slug`.
- Reel público:
  - conserva sus métricas públicas existentes;
  - añade hasta 3 Reels públicos normales del mismo creador;
  - muestra únicamente vistas agregadas en las tarjetas relacionadas.
- La sección relacionada solo aparece cuando existe contenido elegible.
- Autores no descubribles/no indexables no reciben promoción relacionada.
- Sin cambios en feed interno, privacidad, mensajes, base de datos o monetización.
- Sin cambios en `src/routes/posts.js`.


## V1.93.1 — Registration Rate Limit Hotfix

- Corrige falsos bloqueos de registro detectados en producción.
- Sustituye el límite único de 8 intentos / 15 min por IP por dos capas:
  - límite amplio por red: 120 solicitudes / 15 min;
  - límite por identidad de registro (email + usuario): 12 intentos / 15 min.
- La clave de identidad se guarda únicamente como hash efímero en memoria del rate limiter.
- El límite por identidad no depende de compartir IP móvil, Wi‑Fi, proxy o NAT.
- Las respuestas 429 incluyen `retryAfterSeconds`.
- La interfaz muestra el tiempo aproximado real de espera.
- Se mantiene el limitador global y el límite independiente de login.
- Sin migraciones, sin monetización y sin cambios en `src/routes/posts.js`.


## V1.93.2 — Registration Validation Feedback

- Sustituye el mensaje genérico “Revisa los datos” por explicaciones concretas.
- Usa los `fieldErrors` que Zod ya devuelve desde el backend.
- Mensajes específicos para:
  - nombre visible;
  - usuario;
  - email;
  - contraseña;
  - fecha de nacimiento;
  - aceptación +18/condiciones.
- Añade mensaje específico para `invalid_birth_date`.
- Alinea validación HTML con backend:
  - nombre máximo 80;
  - usuario 3–30, letras/números/punto/guion bajo;
  - email máximo 254;
  - contraseña 10–128.
- No expone datos sensibles ni cambia la lógica de registro.
- Sin migraciones, sin monetización y sin cambios en `src/routes/posts.js`.


## V1.93.3 — Registration Field Labels Hotfix

- Corrige la confusión visual detectada entre Nombre visible y Usuario.
- Todos los campos de registro muestran ahora una etiqueta permanente.
- Usuario muestra ayuda adicional:
  - será el @usuario;
  - 3–30 caracteres;
  - sin espacios.
- Añade ejemplos de entrada para Nombre visible y Usuario.
- Conserva la validación detallada de V1.93.2.
- Sin cambios en la lógica de alta, privacidad o base de datos.
- Sin cambios en `src/routes/posts.js`.


## V1.94.0 — Legal & Transparency Center

- Añade centro legal público de RedLibertad:
  - `/legal/` — Aviso Legal;
  - `/privacy/` — Política de Privacidad;
  - `/cookies/` — Cookies y almacenamiento local;
  - `/terms/` — Términos de Uso;
  - `/community-guidelines/` — Normas de la Comunidad;
  - `/moderation/` — Moderación, denuncias y reclamaciones.
- Textos adaptados a RedLibertad, su contenido sensible, verificaciones, comunidades, eventos, mensajería y moderación.
- Footer público con enlaces a las seis páginas.
- Alta actualizada:
  - aceptación expresa de Términos de Uso;
  - aceptación de Normas de la Comunidad;
  - declaración de lectura de Política de Privacidad;
  - enlaces clicables que se abren sin perder el formulario.
- Las páginas legales se incluyen en `sitemap.xml`.
- Sin cambios de base de datos ni monetización.


## V1.94.1 — Momentum Card CTA Hotfix

- Añade un CTA visual **“Ver publicación →”** en las tarjetas de “Desde tu última visita”.
- La tarjeta completa continúa siendo clicable; no se introduce un botón anidado.
- Mejora la claridad de navegación especialmente en móvil.
- Mantiene autor, tiempo e interacciones sin cambios.
- Sin cambios de base de datos ni en `src/routes/posts.js`.


## V1.95.0 — Mobile Interaction Polish

Mejoras recibidas de pruebas reales en móvil:

- Vista previa de foto de perfil y portada dentro de Editar perfil antes de guardar.
- La previsualización parte de las imágenes actuales y cambia al seleccionar nuevos archivos.
- Pull-to-refresh propio en Inicio para recargar feed, Stories, “Desde tu última visita” y datos básicos de cuenta.
- El gesto solo se activa arriba del todo, en dispositivos táctiles y fuera de formularios/modales.
- Al editar una publicación se actualiza inmediatamente:
  - la tarjeta/post visible;
  - el feed;
  - el perfil si está abierto;
  - Reels si corresponde;
  - la vista de detalle si permanecía abierta.
- El botón de comentarios del post usa **💬** en lugar de un círculo genérico.
- Sin cambios de base de datos ni en `src/routes/posts.js`.


## V1.95.1 — Public Profile Layer Hotfix

- Corrige el perfil público abierto desde publicaciones.
- La portada queda en una capa inferior.
- El cuerpo del perfil queda por encima.
- El avatar se mantiene completamente visible sobre la portada.
- Aplica en móvil y escritorio.
- No modifica el perfil propio ni la lógica de datos.
- Sin cambios en `src/routes/posts.js`.


## V1.96.0 — Public Navigation Responsive Polish

- Unifica el comportamiento responsive de las cabeceras públicas.
- Corrige el solapamiento entre la marca RedLibertad y los botones de navegación en escritorio.
- Neutraliza el `min-width:160px` global de los botones dentro de navegación pública.
- Mantiene navegación horizontal contenida en tablet sin invadir la marca.
- En móvil muestra una cabecera limpia con marca + Crear cuenta, ocultando enlaces secundarios.
- Aplica a:
  - Perfiles públicos;
  - Publicaciones y hashtags;
  - Comunidades;
  - Eventos;
  - Reels y Multimedia;
  - Buscar;
  - Descubrir;
  - Temas;
  - Historias;
  - páginas públicas dinámicas generadas por server.js.
- Estilos compartidos en `public/public-nav-v196.css` para evitar divergencias futuras.
- Sin cambios de base de datos ni en `src/routes/posts.js`.


## V1.97.0 — Public Legal Footer & Trust Polish

- Añade un footer legal y de confianza consistente a todas las superficies públicas.
- Enlaces incluidos:
  - Aviso Legal;
  - Privacidad;
  - Cookies;
  - Términos;
  - Normas de la Comunidad;
  - Moderación.
- Añade mensaje de confianza: “Libertad de expresión con límites de legalidad, seguridad y consentimiento.”
- Aplica a:
  - perfiles públicos;
  - publicaciones y hashtags;
  - comunidades;
  - eventos;
  - Reels y Multimedia;
  - búsqueda;
  - descubrir;
  - temas;
  - historias;
  - páginas públicas de detalle generadas por `server.js`.
- Estilos compartidos en `public/public-footer-v197.css`.
- Compatible con la barra móvil de entrada pública V1.92.
- Sin cambios de base de datos ni en `src/routes/posts.js`.


## V1.98.0 — Legal Consent Versioning & Audit Trail

- Convierte la aceptación legal del alta en un registro versionado y auditable.
- Documentos actuales:
  - Términos de Uso `1.0` — acción `accepted`;
  - Normas de la Comunidad `1.0` — acción `accepted`;
  - Política de Privacidad `1.0` — acción `acknowledged`.
- Cada registro guarda:
  - usuario;
  - documento;
  - versión;
  - acción;
  - origen;
  - fecha/hora.
- Las tres entradas nuevas se crean dentro de la misma transacción que la cuenta.
- Cuentas antiguas:
  - solo se conserva la aceptación histórica de términos ya existente;
  - se marca como versión `legacy`;
  - no se inventan aceptaciones de Privacidad o Normas nuevas.
- La exportación de datos del usuario incluye `legalAcceptances`.
- La tabla usa `ON DELETE CASCADE` para respetar el borrado de cuenta.
- Sin cambios visuales en el alta.
- Sin cambios en `src/routes/posts.js`.


## V1.99.0 — Legal Consent Center

- Añade transparencia legal visible dentro de Cuenta y seguridad.
- El endpoint `/api/auth/account` devuelve:
  - historial `legalAcceptances`;
  - versiones legales actuales;
  - rutas de Términos, Normas y Privacidad.
- Nuevo bloque “Términos y privacidad” en la cuenta.
- Para cada documento muestra:
  - estado Actual / Histórico / Sin registro;
  - versión registrada;
  - fecha y hora;
  - enlace al texto correspondiente.
- Las cuentas antiguas con `legacy` quedan identificadas de forma explícita.
- Evita que una cuenta con aceptación versionada reciba además un `legacy` sintético tras reinicios o `db:init`; limpia duplicados legacy si existieran.
- No se fuerza una nueva aceptación en esta versión.
- No se modifican los textos legales ni su versionado actual.
- Sin cambios de base de datos.
- Sin cambios en `src/routes/posts.js`.


## V2.0.0 — Legal Consent Lifecycle

- Confirmación legal explícita y voluntaria en Cuenta y seguridad.
- Formularios solo para documentos cuya versión vigente no conste en el historial.
- POST /api/auth/account/legal-consent autenticado, validado, bloqueado a la versión actual e idempotente.
- Términos y Normas: accepted; Privacidad: acknowledged. Fuente account-legal-center.
- Las aceptaciones legacy conservan su identidad histórica; no hay reconsentimiento automático.
- No modifica textos legales ni versiones (1.0); no bloquea acceso ni cambia posts.js.
- Sin monetización ni migraciones nuevas.


## V2.1.0 — Legal Consent Timeline & Transparency

- **Perfil → Más → Cuenta y seguridad → Términos y privacidad** incorpora un historial desplegable completo (no solo la última versión de cada documento).
- Muestra por registro: documento, versión, estado actual/histórico/legacy, tipo de acción, fecha y origen conocido.
- Privacidad se presenta como **lectura reconocida**; Términos y Normas como **aceptación registrada**.
- Los enlaces de las tarjetas se identifican como **Ver texto actual**: nunca presentan la versión vigente como copia archivada de una aceptación histórica.
- Los registros `legacy` no se convierten en aceptaciones de documentos posteriores y no se obliga a confirmar de nuevo.
- Se conserva la confirmación individual explícita de V2.0, sin escribir al consultar el historial.
- Sin cambios en el esquema, textos legales, API o `src/routes/posts.js`, ni monetización.
- Pruebas automatizadas: `npm run test:legal`.
