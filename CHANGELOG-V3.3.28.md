# V3.3.28 — Publicaciones y comentarios: confirmar sin falsos errores

- El editor ya tenía envío único, recuperación del borrador y protección contra dobles clics; se conservan esos mecanismos.
- Una vez confirmado el POST de una publicación o comentario, un fallo de refresco de listas, perfil o crecimiento no puede convertir el éxito en un mensaje falso de error.
- Las lecturas secundarias se ejecutan de manera independiente, conservando su orden existente; fallar una no cancela las demás.
- Si el guardado real falla, se conserva el texto y sigue mostrándose el error original.
- Sin cambios de API, pagos, permisos, subida multimedia, notificaciones, diseño móvil o actividad automática.
- Pruebas de confirmación de comentarios/publicaciones con tres lecturas secundarias simuladas fuera de servicio.
