# Resuelve V3.6.1 — Seguir preguntas voluntariamente

## Funcionalidad
Quien tenga cuenta puede seguir **una pregunta abierta de otra persona** para recibir, dentro de RedLibertad, un aviso de que hay nuevas respuestas. El seguimiento está desactivado por defecto. El control está en el detalle de la pregunta y se puede cancelar en cualquier momento, también si el problema ya se ha resuelto. Las preguntas resueltas no admiten seguidores nuevos.

## Privacidad y frecuencia
- Cada seguimiento es privado y se guarda asociado al usuario y la pregunta.
- Las preferencias se leen y escriben únicamente con sesión y protección de origen.
- Nunca se permite seguir una pregunta propia u oculta o creada por una cuenta inactiva.
- Al llegar una nueva respuesta válida, se envía **como máximo un aviso en la aplicación cada 24 horas por seguidor**, con una actualización SQL atómica. Nunca se copia el texto de la respuesta ni se revela quién sigue la pregunta.
- No hay correos nuevos, SMS, mensajes directos, seguimientos automáticos, avisos por simples visitas ni campañas comerciales. Los avisos ya existentes al autor y los correos que haya activado el propio autor se mantienen independientes.
- El aviso no debe bloquear la publicación de una respuesta si la infraestructura de notificaciones está temporalmente indisponible.
- Borrar la cuenta o la pregunta elimina los seguimientos relacionados mediante referencias con borrado en cascada.

## Despliegue y verificación
- V3.6.1 mantiene la base Resuelve 2.0, las mejoras móviles y el alta compartida.
- Comprobar seguir, dejar de seguir, pregunta oculta, cuenta inactiva, respuesta nueva, límite de frecuencia y dos sesiones de usuario.
- Ejecutar GitHub Actions y PostgreSQL 18 antes de fusionar.
- Comprobar la nueva versión en Coolify y la entrega de avisos con una prueba real separada.
