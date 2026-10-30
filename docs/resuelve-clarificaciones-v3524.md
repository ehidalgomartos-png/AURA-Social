# Resuelve V3.5.24 — Aclarar una petición sin perder respuestas

Una persona que ha publicado una petición abierta puede añadir una aclaración desde el detalle. Se conserva el texto anterior y las respuestas recibidas: solo se anexa texto público y el autor sigue teniendo la facultad de marcar una respuesta como solución, agradecerla y reabrir la petición más adelante.

## Límites y privacidad
- Solo el autor autenticado de la pregunta, cuando esté abierta.
- Entre 20 y 300 caracteres por aclaración; cuerpo total máximo 1800.
- Actualización atómica en PostgreSQL, condicionada a `author_id`, `status='open'` y límite de longitud.
- Máximo cinco solicitudes de aclaración por hora y cuenta; protección de origen.
- No se envía ninguna notificación de aclaración ni se cambia automáticamente el estado de la pregunta.
- Advertencia clara para no compartir teléfonos, direcciones o datos personales. Moderación normal de la pregunta sigue disponible.

## Pruebas
Validación de contenido, control de acceso, protección CSRF, invariantes SQL y flujo móvil. Fusionar únicamente tras pruebas de GitHub Actions y PostgreSQL 18. Verificar despliegue Coolify independientemente.
