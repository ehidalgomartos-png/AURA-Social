# V3.3.16.1 — Miniaturas y títulos reales de YouTube en publicaciones

- Pegar un enlace de YouTube en Crear → Publicación muestra **antes de publicar** una vista previa con imagen, título y botón de reproducción. No publica ni guarda por sí sola.
- En los posts publicados la tarjeta usa el mismo diseño; si el post contiene únicamente un enlace de YouTube, se oculta su URL larga en el cuerpo para evitar duplicar información. El texto original permanece almacenado y los enlaces externos siguen disponibles en la tarjeta.
- Obtención del título mediante el endpoint oficial oEmbed de YouTube por el VPS, con tiempo límite, validación estricta y caché. Si no hay metadatos, se presenta el texto «Vídeo de YouTube» sin bloquear la publicación.
- Miniatura obtenida mediante proxy exclusivamente desde `i.ytimg.com` con identificador validado: los visitantes no se conectan a YouTube al ver la imagen. El reproductor `youtube-nocookie.com` continúa siendo opcional y solo se crea al pulsar reproducir.
- En el editor se oculta la vista previa cuando se añade otro archivo o se cambia a Reel/Story, evitando confusión.
- Sin cambio de esquema de PostgreSQL, permisos ni visibilidad. Pruebas de metadatos, tipos de imagen, caché, inserción protegida y previsualización. GitHub Actions y PostgreSQL 18 deben estar en verde antes de fusionar.
