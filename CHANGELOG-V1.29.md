# RedLibertad V1.29.0 — Creator Tasks & Reminders

Base estable: V1.28.0.

## Funcionalidad
- Tareas privadas para creadores verificados.
- Título, nota privada, prioridad normal/alta y fecha/hora opcional.
- Estados open/completed.
- Completar, reabrir y reprogramar.
- Búsqueda y filtros.
- Relaciones opcionales con notification_id, related_user_id y post_id.
- source_key preparado para automatizaciones futuras.

## API
- GET /api/creator/tasks
- POST /api/creator/tasks
- PATCH /api/creator/tasks/:id
- PATCH /api/creator/tasks/bulk

## Privacidad
- Solo el creador propietario puede leer o modificar sus tareas.
- Nada aparece en feeds, perfiles ni APIs públicas.

## Monetización
- Sin pagos, suscripciones, precios, checkout, créditos, saldo ni paywalls.
