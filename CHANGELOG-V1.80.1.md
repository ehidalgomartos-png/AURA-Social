# RedLibertad V1.80.1 — Social Core Recovery Hotfix

Hotfix sobre V1.80.0.

## Problema corregido
Algunos bootstraps históricos volvían a crear `notifications_type_check` con listas antiguas. Tras un redeploy, si la base ya contenía notificaciones de eventos o colaboraciones, el `ALTER TABLE ... ADD CONSTRAINT` podía fallar y bloquear rutas completas de publicaciones/perfiles.

## Cambios
- Normalización forward-compatible de todos los `notifications_type_check` en posts, profiles y schema.
- Conservación de todos los tipos actuales de notificación.
- Estados de error/reintento para resumen social, sugerencias, publicaciones de perfil y consentimientos.
- El arranque ya no deja zonas en blanco si falla `/api/profiles/me/summary`.
- PWA cache V1.80.1.
- Health/version V1.80.1.
- Sin monetización.
