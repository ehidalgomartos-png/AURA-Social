# V3.3.15 — Vídeos de YouTube en publicaciones

- Se puede pegar un enlace seguro de YouTube en el texto de una publicación normal. Admite `youtube.com/watch`, `youtu.be`, `shorts`, `live` y `embed` con ID de vídeo válido.
- El post muestra una tarjeta 16:9 con botón «Reproducir vídeo» y enlace directo. No se descarga el vídeo ni se emplea almacenamiento del VPS o claves API de YouTube.
- El iframe de `youtube-nocookie.com` solo se crea después de pulsar reproducir, con mejor privacidad y sin carga de scripts externos antes de consentir.
- No se crea iframe para publicaciones restringidas por contenido, Reels ni posts con archivo multimedia, y no se alteran los permisos ni la audiencia de la publicación.
- Se incluye una indicación en el formulario y versionado de CSS/JS.
- Pruebas de dominios falsos, formatos válidos, restricciones, activación de iframe y regresión. La suite general y PostgreSQL 18 deben concluir satisfactoriamente antes de fusionar.

Nota: vídeos eliminados, privados o con inserción prohibida por su propietario pueden no reproducirse dentro de RedLibertad, pero el enlace a YouTube permanece.
