# RedLibertad V1.25.0 — Community Activity Center

Base estable: RedLibertad V1.24.0 — Community Insights & Creator Notifications.

## Centro de actividad
- Nuevo bloque privado dentro del Centro de creador.
- Usa las notificaciones de primera participación de V1.24 como fuente de actividad.
- No duplica votos ni respuestas.
- Filtros:
  - Pendiente.
  - Revisado.
  - Todo.

## Agrupación
- La actividad se agrupa por encuesta o pregunta.
- Cada grupo muestra:
  - tipo,
  - Público / VIP,
  - estado abierta / cerrada / archivada,
  - participaciones del filtro,
  - pendientes de revisar,
  - hasta 6 participantes recientes.
- El resto se resume como participaciones agrupadas para evitar listas excesivas.

## Flujo de revisión
- Marcar una participación como revisada.
- Marcar todo un grupo como revisado.
- Marcar toda la actividad pendiente como revisada.
- Revisar no modifica:
  - el voto,
  - la respuesta,
  - la publicación,
  - la notificación original.
- Es un estado exclusivamente privado del creador.

## Estado actual
- Si un usuario retiró su voto, aparece como Voto retirado.
- Si retiró su respuesta, aparece como Respuesta retirada.
- No se muestra información antigua como si siguiera vigente.
- Posts eliminados no inflan el contador de pendientes.

## Navegación
- Los avisos creator_poll_vote y creator_question_response siguen apareciendo en Notificaciones → Comunidad.
- Al abrir uno de esos avisos se abre el Centro de creador y se desplaza al Centro de actividad.
- El Centro abre por defecto el filtro Pendiente.

## Base de datos
- Nueva tabla creator_community_notification_reviews.
- notification_id como clave primaria.
- creator_id con FK a users.
- reviewed_at.
- ON DELETE CASCADE desde notifications.
- Índice idx_creator_community_reviews_creator.
- Bootstrap idempotente.

## Privacidad
- Solo el creador verificado propietario puede consultar o modificar el estado Revisado.
- Las identidades de votantes siguen sin exponerse públicamente.
- No cambia la privacidad de respuestas abiertas.
- No añade tracking externo.

## Monetización
V1.25 continúa completamente sin monetización activa:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldos,
- sin paywalls.
