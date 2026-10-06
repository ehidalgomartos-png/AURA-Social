# RedLibertad V1.27.0 — Follow-up Dashboard

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
