# Resuelve V3.6.2 — Peticiones pendientes y recordatorios voluntarios

## Mis peticiones pendientes
En «Mis peticiones» aparece un resumen privado de hasta doce preguntas propias abiertas, priorizando las que aún no tienen respuestas visibles. Cada entrada enlaza a la petición y solo muestra título y cantidad de respuestas de personas con cuentas activas.

## Recordatorio opcional
Cada autor puede activar o desactivar por separado un recordatorio semanal de su propia pregunta. La preferencia comienza desactivada y no cambia la indexación, el seguimiento de otros usuarios ni las preferencias de correo.

Un proceso horario considera únicamente preguntas abiertas con autor activo, publicadas hace al menos tres días, cuyo recordatorio se activó hace al menos 24 horas. Envía como máximo un aviso interno cada siete días por pregunta. La consulta SQL actualiza la fecha y crea la notificación de forma atómica, usando bloqueo de filas y SKIP LOCKED para evitar duplicados con varios procesos.

Los avisos no incluyen textos de preguntas, datos personales, teléfonos ni respuestas. Si hay respuestas, recuerdan revisarlas. Si no, sugieren añadir una aclaración o compartir la pregunta. No se envían correos, SMS ni mensajes a otros usuarios. No se publica ninguna respuesta automáticamente.

La revocación también es posible después de que el problema esté resuelto. La eliminación de una cuenta o pregunta borra sus preferencias mediante claves externas en cascada. El proceso se detiene junto al servidor en Coolify.

## Validación
Antes de fusionar: autenticación del autor, revocación, límites, concurrencia, estados oculto/resuelto, cierre de sesión, experiencia móvil, GitHub Actions y PostgreSQL 18. El despliegue y los avisos reales deberán comprobarse por separado en producción.