# RedLibertad V1.28.0 — Follow-up Workflow & History

Base estable: RedLibertad V1.27.1 — Follow-up Dashboard Hotfix.

## Historial privado
- Los seguimientos completados ya no desaparecen sin rastro.
- Nueva columna privada completed_at.
- La fecha programada anterior se conserva al completar.
- Vista Activos / Completados.
- Contadores separados para activos y completados.
- Resumen de completados de los últimos 30 días.

## Reapertura
- Reabrir un seguimiento completado.
- Conserva nota privada, prioridad y fecha anterior.
- Al reabrir, completed_at vuelve a NULL.
- Puede reprogramarse después con los mismos controles de seguimiento.

## Reprogramación
- Individual:
  - +1 hora.
  - Mañana 09:00 según hora local del navegador.
  - +7 días.
  - Sin fecha.
- Masiva:
  - +1 hora.
  - Mañana 09:00.
  - +7 días.
  - Sin fecha.
- La reprogramación mantiene el seguimiento activo.

## Acciones masivas adaptativas
- En Activos:
  - prioridad alta/normal,
  - marcar revisado,
  - reprogramar,
  - completar.
- En Completados:
  - prioridad alta/normal,
  - marcar revisado,
  - reabrir.

## Robustez
- Completados excluidos de vencidos, hoy, próximos y sin fecha.
- Posts eliminados siguen excluidos mediante JOIN propietario existente.
- Búsqueda privada y prioridad funcionan tanto en Activos como en Completados.
- Límite de día local se conserva para clasificación temporal activa.
- Bootstrap idempotente.

## Base de datos
- ALTER TABLE creator_community_activity_meta ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ.
- Índice parcial:
  - idx_creator_community_activity_completed_at.

## Privacidad
- Todo el workflow es privado del creador verificado propietario.
- Notas, prioridad, fechas y completed_at no se exponen en feeds, perfiles ni APIs públicas.
- Sin tracking externo.

## Monetización
V1.28 continúa sin monetización activa:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldo,
- sin paywalls.
