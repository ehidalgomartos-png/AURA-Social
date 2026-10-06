# RedLibertad V1.36.0 — Messaging 2.0

Base estable: V1.35.0 — Creator Hub 2.0.

## Inbox
- Fijar conversaciones.
- Archivar/desarchivar sin borrar mensajes.
- Silenciar/reactivar avisos como preferencia privada del miembro.
- Filtros Activas, No leídas y Archivadas.
- Búsqueda por nombre visible o @usuario.
- Orden: fijadas, no leídas y actividad reciente.

## Privacidad y seguridad
- Las preferencias pertenecen solo al miembro de la conversación.
- Se mantienen bloqueos y privacidad de mensajes.
- El consentimiento para contenido sensible no cambia.
- No se exponen nuevas preferencias públicamente.

## Base de datos
- conversation_members.is_pinned.
- conversation_members.is_archived.
- conversation_members.notifications_muted.
- Índice idx_conversation_members_inbox.
- Bootstrap idempotente.

## Monetización
Sin pagos, suscripciones, precios, checkout, créditos, saldo ni paywalls.
