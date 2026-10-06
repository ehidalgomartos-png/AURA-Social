# RedLibertad V1.27.0 — Follow-up Dashboard

Base estable: RedLibertad V1.26.0 — Creator Follow-up & Private Notes.

## Dashboard de seguimiento
- Nueva vista privada dentro del Centro de creador.
- Reutiliza los seguimientos V1.26 sin duplicar datos.
- Clasificación:
  - Vencidos.
  - Hoy.
  - Próximos 7 días.
  - Más adelante.
  - Sin fecha.
- “Hoy” usa el límite de día local enviado por el navegador para no depender de la zona horaria del servidor.

## Resumen
- Seguimientos totales.
- Vencidos.
- Para hoy.
- Próximos 7 días.
- Prioridad alta.

## Búsqueda privada
- Busca únicamente dentro de private_note.
- Máximo 120 caracteres.
- Filtrado en servidor.
- Debounce de 280 ms en cliente.
- Las notas nunca se exponen fuera de endpoints privados de creador.

## Selección y acciones masivas
- Selección individual.
- Seleccionar todos los visibles.
- Contador de seleccionados.
- Acciones:
  - Prioridad alta.
  - Prioridad normal.
  - Marcar revisado.
  - Cerrar seguimiento.
- Cerrar seguimiento:
  - follow_up=false.
  - follow_up_at=NULL.
- Confirmación antes de cierre masivo.

## Integración
- “Abrir en actividad” lleva al Centro de actividad con filtro Seguimiento.
- Cambios individuales de V1.26 refrescan el dashboard.
- Cambios de Revisado de V1.25 refrescan el dashboard.
- Las acciones masivas refrescan dashboard y Centro de actividad.

## Robustez
- Seguimientos asociados a posts eliminados no aparecen ni cuentan en el resumen.
- Corrección del root DOM de selección múltiple.
- Índice específico por fecha de seguimiento.

## API
- GET /api/posts/creator/community-follow-ups.
- Parámetros:
  - window=all|overdue|today|week|later|undated.
  - q.
  - dayEnd.
- PATCH /api/posts/creator/community-follow-ups/bulk.
- Acciones válidas:
  - priority_high.
  - priority_normal.
  - mark_reviewed.
  - close_follow_up.

## Base de datos
- Reutiliza creator_community_activity_meta.
- Nuevo índice:
  - idx_creator_community_activity_follow_up_at.
- Clave de acceso:
  - creator_id.
  - follow_up.
  - follow_up_at.
  - priority.
- Bootstrap idempotente.

## Privacidad
- Solo el creador verificado propietario puede consultar o modificar seguimientos.
- Búsqueda limitada a notas privadas.
- No modifica visibilidad de posts, votos ni respuestas.
- Sin tracking externo.

## Monetización
V1.27 continúa completamente sin monetización activa:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldos,
- sin paywalls.
