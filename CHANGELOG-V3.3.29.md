# V3.3.29 — Conversaciones privadas con apertura fiable

- Se reutiliza el bloqueo de envíos simultáneos ya presente en el editor para evitar peticiones duplicadas cuando una persona pulsa repetidamente «Abrir conversación» en móvil.
- Si la API confirma la creación/existencia de la conversación, se abre el chat concreto directamente. La navegación ya actualiza la lista y no hace falta emitir una segunda consulta de lista que compita con la primera.
- Si la API falla, el formulario y el nombre introducido se conservan para reintentar; el botón se reactiva.
- Sin mensajes generados, nuevos destinatarios, bypass de privacidad, cambios visuales ni llamadas a servicios externos.
