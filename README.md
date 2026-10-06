# RedLibertad V1.67.0 — Accessibility & UX Quality 2.0

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
