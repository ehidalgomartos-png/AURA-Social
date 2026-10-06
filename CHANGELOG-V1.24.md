# RedLibertad V1.24.0 — Community Insights & Creator Notifications

Base estable: RedLibertad V1.23.0 — Community Management 2.0.

## Notificaciones al creador
- Primer voto de una persona en una encuesta: genera una notificación al creador.
- Primera respuesta de una persona a una pregunta abierta: genera una notificación al creador.
- Cambiar un voto no genera otro aviso.
- Editar una respuesta no genera otro aviso.
- Retirar una interacción y volver después tampoco duplica el aviso.
- No se generan avisos por la participación del propio creador.
- Los avisos aparecen en Notificaciones → Comunidad.
- Al abrirlos se accede directamente al bloque de gestión de comunidad del Centro de creador.

## Deduplicación
- Control lógico con NOT EXISTS.
- Refuerzo con índice único parcial de base de datos.
- ON CONFLICT DO NOTHING para carreras concurrentes.
- Un único aviso por creador + participante + post + tipo de interacción.

## Insights 7 / 30 días
- Votos recibidos en 7 días.
- Votos recibidos en 30 días.
- Respuestas recibidas en 7 días.
- Respuestas recibidas en 30 días.
- Participación combinada de 7 y 30 días.
- Personas únicas que participaron durante los últimos 30 días.

## Tendencia de 14 días
- Serie diaria privada del creador.
- Se separan visualmente votos y respuestas.
- Los días sin actividad se mantienen para mostrar continuidad temporal.

## Herramientas con más actividad
- Ranking privado de hasta 8 herramientas.
- Incluye encuestas y preguntas.
- Ordenado por actividad de 30 días y después 7 días.
- Muestra:
  - tipo,
  - audiencia Público / VIP,
  - estado abierta / cerrada / archivada,
  - participación 7d,
  - participación 30d.
- Cada elemento abre la publicación correspondiente.

## Privacidad
- Los insights solo están disponibles para el creador verificado propietario.
- Las identidades de votantes continúan sin exponerse en resultados.
- Las respuestas abiertas mantienen su privacidad de V1.22/V1.23.
- El creador ve la identidad del participante únicamente en sus avisos y bandeja privada.
- No se añade analítica externa ni tracking de terceros.

## Base de datos
- Nuevos tipos de notificación:
  - creator_poll_vote.
  - creator_question_response.
- idx_creator_poll_votes_created.
- idx_creator_question_responses_created.
- idx_notifications_creator_community_once.
- Bootstrap idempotente.

## Monetización
V1.24 continúa completamente sin monetización activa:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldos,
- sin paywalls.
