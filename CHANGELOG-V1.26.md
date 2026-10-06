# RedLibertad V1.26.0 — Creator Follow-up & Private Notes

Base estable: RedLibertad V1.25.0 — Community Activity Center.

## Seguimiento privado
- Cada actividad de comunidad puede marcarse con prioridad Normal o Alta.
- Puede dejarse en Seguimiento.
- Puede incluir fecha/hora opcional de seguimiento.
- Puede guardar una nota interna de hasta 1000 caracteres.
- Los datos pertenecen únicamente al creador.

## Independencia del estado Revisado
- Prioridad, nota y seguimiento no cambian al marcar Revisado.
- Una actividad revisada puede permanecer en seguimiento.
- Una actividad pendiente puede marcarse como alta prioridad.
- La nota privada no cambia votos, respuestas ni publicaciones.

## Filtros
- Enfoque Todas.
- Enfoque Prioridad alta.
- Enfoque Seguimiento.
- Los filtros se combinan con Pendiente / Revisado / Todo.
- Contadores globales privados de prioridad alta y seguimiento.

## Interfaz
- Distintivo Prioridad alta.
- Distintivo Seguimiento.
- Fecha de seguimiento visible solo para el creador.
- Editor privado por actividad.
- Adaptación mobile-first a ancho completo.

## API
- GET /api/posts/creator/community-activity?status=...&focus=...
- PATCH /api/posts/creator/community-activity/:notificationId/meta.
- Solo un creador verificado puede usar estos endpoints.
- Solo se permite editar notificaciones de comunidad propias.

## Base de datos
- creator_community_activity_meta.
- notification_id PK + FK ON DELETE CASCADE.
- creator_id FK.
- priority normal/high.
- private_note.
- follow_up.
- follow_up_at.
- updated_at.
- Índice idx_creator_community_activity_meta_creator.
- Bootstrap idempotente.

## Privacidad
- Metadatos no expuestos públicamente.
- No aparecen en feeds, perfiles ni posts.
- No cambian la privacidad original de votos o respuestas.
- No se añade tracking externo.

## Monetización
V1.26 continúa completamente sin monetización activa:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldos,
- sin paywalls.
