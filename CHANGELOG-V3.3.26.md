# V3.3.26 — Contadores de mensajes y notificaciones coherentes

- Un listado de conversaciones filtrado, buscado o limitado deja de modificar la insignia global con un subtotal. La señal de actividad autenticada SSE sigue informando el total real.
- Después de que el servidor confirme la lectura individual o total de notificaciones, y al abrir con éxito una conversación (lectura marcada por la ruta existente), se solicita una reconciliación puntual del contador del icono PWA.
- No se añaden llamadas periódicas, nuevas pantallas, estadísticas de comportamiento ni cambios de datos.
- Se actualiza el recurso JavaScript para cachés PWA y se refuerzan pruebas de regresión de búsquedas y respuestas tardías.
