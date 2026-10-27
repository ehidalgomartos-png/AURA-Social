# V3.3.16 — Novedades importantes por email

## Por qué
Enviar solo comunicados excepcionales relevantes para miembros de RedLibertad, no avisos repetitivos por cada publicación. El envío de novedades es independiente de los avisos de mensajes sin leer.

## Flujo
1. En Cuenta cada persona puede activar voluntariamente el boletín (desactivado por defecto).
2. Administración ve el número de suscriptores, redacta título y resumen y confirma expresamente un comunicado.
3. Se genera una cola persistente para suscriptores activos, con intentos limitados, exclusión de usuarios dados de baja y protección frente a repeticiones del mismo comunicado en el mismo día.
4. Se envía mediante Resend desde el remitente ya verificado; todos los correos tienen enlace de baja de un clic y versión de confirmación sin sesión. Una visita GET al enlace no desuscribe automáticamente.
5. El panel muestra recuentos de envíos, pendientes y fallos.

## Activación controlada
Por seguridad, `IMPORTANT_UPDATES_EMAIL_ENABLED=false` inicialmente. Para activar envíos, configurar `IMPORTANT_UPDATES_EMAIL_ENABLED=true` en Coolify y tener `RESEND_API_KEY` y `MESSAGE_EMAIL_FROM` válidos. Nadie queda suscrito automáticamente y ningún correo se envía por el despliegue.

## Seguridad
Los contenidos del boletín se escapan como HTML; los únicos enlaces de destino pertenecen a RedLibertad. No incluye información privada ni destinatarios visibles entre sí. Ningún post, noticia, newsletter o campaña se publica/envía sin autorización en Administración.

## Pruebas
Test de preferencias, no suscripción predeterminada, baja, bloqueos de envío sin permiso, cabeceras de Resend, idempotencia y controles de administración, más suite y PostgreSQL 18.
