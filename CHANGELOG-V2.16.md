# RedLibertad V2.16.0 — Escalado externo de alertas críticas

**Base estable:** V2.15.0, commit c5100e96b96bc328b3e8e41c43bd6c30b341b216 (PR #145).

## Implementación
- Webhook externo **opcional**, desactivado por defecto, compatible solo con Slack y Discord mediante HTTPS.
- Variable secreta `OPS_ALERT_WEBHOOK_URL` en Coolify; nunca guardar el token real en GitHub.
- Validación estricta del host y del esquema, sin credenciales, query, fragmentos ni redirecciones.
- Contenido saliente reducido a alerta técnica predefinida, severidad y consejo. No envía emails, IP, perfiles, posts ni mensajes privados.
- Cola de entrega persistente en PostgreSQL y dos tablas aditivas: `operational_alert_deliveries_v216` y `operational_delivery_audit_v216`.
- Deduplicación por alerta y ciclo de incidencia con nueva entrega solo después de recuperación y recaída.
- Solo notifica alertas críticas, abiertas y activas. Incidencias recuperadas se excluyen de envíos pendientes.
- Procesamiento cada 2 minutos, 3 trabajos por ciclo, reclamo con `FOR UPDATE SKIP LOCKED` y sin transacciones abiertas durante envío.
- Máximo 5 intentos; reintentos escalonados hasta 15 minutos; tiempo máximo de petición de 6 segundos.
- Panel administrativo mobile-first con entregas pendientes, enviadas y fallidas, y reintento manual auditado con nota.
- El sistema de alertas V2.15 y las funcionalidades sociales permanecen intactos.

## Limitaciones
- Sin variable configurada, no se realizan solicitudes de red ni se crean colas nuevas.
- Entrega al menos una vez: puede producirse duplicado en caso de caída entre envío y confirmación.
- La caída completa de PostgreSQL o de la aplicación no puede detectarse desde el propio proceso: requiere monitor externo de Coolify.
- No se cambia ninguna publicación, usuario, multimedia ni dato social. Monetización aparcada.

## Validación tras autorización
1. GitHub Actions completas y en verde; no fusionar sin aprobación.
2. En Coolify, comprobar despliegue, versión 2.16.0 en /api/health y PostgreSQL en /api/ready.
3. Comprobar que sin configurar webhook el panel muestra el envío desactivado.
4. Probar un webhook en staging con una incidencia técnica controlada, sin simular eliminaciones reales.
5. Verificar deduplicación, reintentos, historial, privacidad, móviles, posts, chat y PWA.
