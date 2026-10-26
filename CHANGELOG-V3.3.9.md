# V3.3.9 — Navegación móvil: listas siempre actualizadas

## Problema
Si una persona cambiaba deprisa los filtros o la búsqueda de Mensajes, una respuesta anterior podía llegar después que otra más nueva y sobrescribir la lista. También podían solaparse dos consultas de Notificaciones y restablecer el contador antiguo.

## Cambios
- Las listas de conversaciones y notificaciones asignan un número de secuencia a cada consulta.
- Solo la última consulta válida puede actualizar la vista, el indicador de carga y los contadores. Se descartan resultados y errores anteriores.
- En Mensajes, también se comprueban los filtros y términos de búsqueda vigentes: las respuestas antiguas no pueden abrir conversaciones desde un enlace directo.
- Sin peticiones nuevas, sin cachés persistentes ni texto de mensajes adicional; se reutilizan los endpoints y controles de privacidad existentes.
- Pruebas de orden inverso de respuestas, errores antiguos, cambios de filtro y búsqueda con debounce, y enlaces directos.

**Verificación:** GitHub Actions y PostgreSQL 18 previos y posteriores a la fusión. Confirmación del despliegue en Coolify por separado.
