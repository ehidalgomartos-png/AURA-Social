# Resuelve V3.5.29 — Páginas públicas de soluciones con autorización expresa

## Decisión de privacidad
Las preguntas y el contenido general de `/resuelve` **continúan en noindex**. Esta versión crea páginas HTML específicas de una solución **únicamente** cuando el autor de la petición autoriza expresamente su publicación para buscadores, la pregunta está resuelta y un administrador ha aprobado la solución para biblioteca tras las comprobaciones humanas de privacidad, utilidad y ausencia de promoción encubierta.

## Funcionamiento
- Permiso independiente `resuelve_questions.seo_public_opt_in`, inicialmente `false`.
- En el detalle de una pregunta resuelta propia hay un control de permiso revocable. La URL solo se muestra cuando existe revisión editorial y permiso.
- Rutas autenticadas para leer y cambiar el permiso de una pregunta propia. La escritura requiere origen válido y rate limit.
- La página `/resuelve/solucion/:id` se sirve como HTML en servidor, con title, descripción, canonical y Open Graph, escapando todos los campos de usuario.
- No copia el cuerpo original de la pregunta, email, teléfonos, nombres de denunciantes ni respuestas no aceptadas. La solución puede estar basada en experiencias y no se presenta como consejo profesional verificado.
- No depende de una campaña comercial, ni crea contenido automáticamente.

## Revocación y contenido retirado
Cuando se retira el permiso, se pierde la aprobación, se oculta la respuesta, se marca opt-out o el autor deja de estar activo, la página deja de estar disponible y responde **404 con noindex**. El servidor usa `Cache-Control: no-store` para evitar mostrar contenido obsoleto de caché propia. Reabrir una pregunta restablece el permiso a `false`.

La eliminación de resultados **ya indexados** depende de los tiempos de rastreo de Google; no es instantánea. El usuario puede gestionar la retirada sin contactar al administrador.

## Pendiente para V3.5.30
Sitemap de estas páginas, marcado estructurado, controles más granulares y consolidación SEO. No se añaden URLs a sitemap mientras su indexabilidad no esté controlada.

**Validación:** GitHub Actions, PostgreSQL 18, comprobación SEO/404 y Coolify por separado.
