# RedLibertad V1.74.0 — Release Audit & Safe Rollback

Base: V1.73.0 — Beta Cohorts & Release Control.

- Historial de cambios de features y cohortes.
- Actor, fecha y request ID por cambio.
- Snapshots Antes / Después.
- Auditoría de kill switch, modo todos/cohortes, asignaciones y miembros.
- Rollback transaccional de configuración.
- Protección rollback_conflict cuando el estado actual ya cambió.
- Restauración de asignaciones de cohortes por feature.
- Restauración de miembros y estado de cohortes.
- Los rollbacks generan su propia entrada de auditoría.
- Las creaciones se auditan pero no se eliminan automáticamente.
- Consola visual de historial y botón Restaurar estado anterior.
- Esquema PostgreSQL persistido e índices de auditoría.
- Checklist de rollback ampliado.
- Mobile-first.
- Sin monetización.
