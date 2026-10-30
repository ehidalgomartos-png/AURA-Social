# Resuelve V3.5.21 — Avisos cuando alguien responde

## Ya existía
El servidor inserta una notificación interna en RedLibertad al publicar una respuesta. La misma tabla alimenta notificaciones del perfil y notificaciones web push si están activas.

## Novedades
- Corrige la validación del identificador al abrir notificaciones de Resuelve desde el centro de avisos.
- Los avisos web push con origen Resuelve abren directamente `/resuelve?id=<identificador>` sin pasar por una bandeja genérica.
- Cada usuario con sesión puede consultar en la pantalla de Resuelve su opción de recibir correo por respuestas. Por defecto está **desactivada**.
- Ruta de preferencia autenticada y protección de origen; la opción puede revocarse en cualquier momento.
- Correos por Resend sin texto de respuestas, con enlaces a la petición, enviados solo si `RESUELVE_EMAIL_ENABLED=true`, `RESEND_API_KEY` válido y remitente `RESUELVE_EMAIL_FROM` verificado (o `MESSAGE_EMAIL_FROM`).
- Antes de crear el trabajo y antes de enviar se comprueba consentimiento, cuenta activa, verificación del correo, pregunta abierta, respuesta visible, bloqueo/mute y si ya se abrió la notificación.
- Cola persistente PostgreSQL, demora de 15 minutos, reintentos acotados e idempotencia por respuesta. La respuesta del usuario se guarda aunque el correo falle.
- Se puede desplegar sin activar correos todavía. En ese caso el control informa que el servicio de email no está disponible; las notificaciones internas siguen activas.

## Operaciones
Tras desplegar, configurar el remitente Resend y habilitar `RESUELVE_EMAIL_ENABLED=true` solo cuando se haya comprobado la identidad del dominio, sin compartir claves en chats. Verificar el correo de una cuenta, activar consentimiento desde Resuelve y realizar una respuesta de prueba. No se activa automáticamente el envío de correos comerciales.

## Seguridad y seguimiento
No se revelan detalles de la pregunta o respuesta en los correos. Las notificaciones internas continúan bajo los controles generales de privacidad y suscripciones push del usuario.
