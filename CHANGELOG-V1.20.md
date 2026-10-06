# RedLibertad V1.20.0 — Creator Publishing Tools

Base estable: RedLibertad V1.19.0 — VIP Stories & Exclusive Feed.

## Borradores
- Los creadores verificados pueden guardar publicaciones como borrador.
- Los borradores no aparecen en feeds, perfiles, búsqueda, Trending, Momentum ni la pestaña VIP.
- Pueden contener texto, foto/vídeo, clasificación, audiencia pública/VIP y participantes.
- Los borradores con participantes no envían solicitudes de consentimiento hasta que se programan o se intenta publicar.

## Programación
- Programación entre 5 minutos y 90 días.
- Las publicaciones programadas permanecen ocultas con creator_state=scheduled.
- Scheduler interno ejecutado cada 60 segundos.
- Las rutas de posts también comprueban publicaciones vencidas como respaldo.
- Al publicarse se actualiza created_at para entrar correctamente en los listados recientes.
- La programación admite contenido Público y Solo VIP.

## Consentimiento
- Un post programado con participantes nunca se publica sin aprobación.
- Si todos aprueban antes de la hora programada, permanece oculto hasta la hora.
- Si la hora ya pasó mientras faltaba consentimiento, se publica en cuanto llega la última aprobación.
- Publicar ahora un borrador con participantes envía las solicitudes y mantiene el contenido oculto hasta aprobarse.
- Volver una publicación programada a borrador vuelve a ocultarla aunque los consentimientos ya estén aprobados.

## Centro de creador
- Nueva sección Borradores y programación.
- Resumen de número de borradores y programadas.
- Vista previa de contenido.
- Estado Público/VIP.
- Indicador de consentimientos pendientes.
- Acciones:
  - Publicar ahora.
  - Programar.
  - Reprogramar.
  - Volver a borrador.
  - Eliminar.

## Compositor
- Creadores verificados ven tres opciones:
  - Guardar borrador.
  - Programar.
  - Publicar ahora.
- Las cuentas no verificadas conservan el flujo de publicación inmediata.
- Campo datetime-local con límites de programación.
- Mensajes de estado específicos para cada modo.

## Base de datos
- Nueva columna posts.creator_state.
- Valores permitidos: live, draft, scheduled.
- Nueva columna posts.scheduled_for.
- Constraint posts_creator_state_check.
- Índice idx_posts_creator_state_schedule.
- Bootstrap idempotente.

## Correcciones
- Se corrige una referencia heredada de ownerId en notificaciones de Me gusta.
- Se corrige una referencia heredada en notificaciones de comentarios.
- Se reparan en db/schema.sql los bloques DO de posts_audience_check y stories_audience_check para instalaciones nuevas.

## Monetización
V1.20 no añade monetización:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldos,
- sin paywall comercial.

Las herramientas de publicación funcionan igual para contenido público y VIP gratuito.
