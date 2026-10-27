# V3.3.40 — Auditoría general: privacidad y recuperación

- Se corrige una exposición de texto sensible en la página pública `/p/:id`. Las publicaciones con clasificación distinta de `normal` muestran un bloqueo informativo en lugar de captions o contenido de texto; sus metadatos se mantienen neutros y no indexables.
- Los identificadores de post malformados, no canónicos o fuera del rango BIGINT devuelven 404 sin una consulta SQL fallida.
- Sin cambios en posts almacenados, datos de usuario, permisos, chats, notificaciones, PWA ni pantalla Inicio.
- Incluye pruebas de privacidad y regresión en CI, además de auditoría documentada de seguridad, SEO, despliegue y procedimientos de backup/restauración.
- No se declara probada ninguna restauración, retención ni backup real de Coolify: la revisión operativa sigue pendiente de pruebas controladas fuera de GitHub.
