# Pulso — evolución de vídeos cortos de RedLibertad

## V3.6.58 — Primer visor público
- Ruta `/pulso` con vídeos verticales reales y navegación por desplazamiento.
- Inicio desde `/pulso` y enlace a Pulso en la portada; dentro de la app se renombra el acceso «Reels» a «Pulso» conservando internamente la vista `reels`.
- Misma cuenta, publicaciones, Reels, comentarios, me gusta y sistema de seguimiento existentes. Para interactuar desde el visor público se accede al Reel y luego a la app.
- Selección pública restringida a vídeos: publicación aprobada, público, contenido normal, autor activo y descubrible, no administrador. Nada de públicos privados, historias restringidas o contenido sensible.
- Reproducción silenciada solo cuando el vídeo está visible (no automática con ahorro de datos o movimiento reducido); nunca reproducir en segundo plano.
- Paginación acotada, sin contadores de actividad inventados, sin duplicación de multimedia ni cambios en PostgreSQL.

## Próximas iteraciones (no incluidas todavía)
1. **Pulso 1.1 — experiencia de creador:** acceso directo a crear Reel desde Pulso, portadas y validación de vídeo móvil sin recargar la app.
2. **Pulso 1.2 — interacciones integradas:** Me gusta, comentar, seguir y compartir en el mismo visor exclusivamente para usuarios autenticados, reutilizando las APIs y permisos actuales.
3. **Pulso 1.3 — Siguiendo y descubrimiento:** pestaña de vídeos de personas seguidas y recomendaciones transparentes basadas únicamente en contenido elegible y preferencias activadas.
4. **Pulso 1.4 — rendimiento y moderación:** medición real, subida de vídeos eficiente, límites de almacenamiento, estados de error, denuncias y controles de privacidad.
5. **Pulso 1.5 — SEO y calidad:** metadatos de vídeos públicos, pruebas de móvil, accesibilidad, vídeos de baja velocidad y diagnóstico de reproducción.

## Criterios
- Mobile-first, sin registros adicionales, ni perfiles ficticios, ni interacciones artificiales.
- Sin sacar vídeos privados a un visor público.
- El almacenamiento multimedia sigue siendo el configurado en RedLibertad (VPS local cuando esté activo).
- Toda versión pasa GitHub Actions y pruebas PostgreSQL 18 antes de fusionar.
- Fusión en `main` no confirma por sí sola el despliegue en Coolify.
