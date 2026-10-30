# Resuelve V3.5.23 — Avisos voluntarios de nuevas peticiones

## Principio
Elegir temas para ayudar **no activa notificaciones automáticamente**. Cada cuenta puede activar o revocar por separado «Avísame de nuevas peticiones de mis temas». Se guarda en `resuelve_help_preferences.notify_new_questions`, con valor por defecto `false`.

## Entrega
Al publicar una pregunta real se consulta qué usuarios activos han elegido su categoría y consentido recibir avisos. Se crea una notificación interna que puede activar web push solo si el dispositivo ya lo tiene autorizado según las preferencias generales. No se envía correo ni se crean respuestas artificiales.

Para evitar saturación, se prioriza un máximo de 20 destinatarios por petición y como máximo un aviso diario por destinatario. El sistema omite al autor de la pregunta y cuentas que hayan bloqueado o silenciado al autor. Una incidencia de notificaciones nunca impide publicar la petición.

## Privacidad
Las preferencias se consultan y editan únicamente mediante sesión autenticada; el cliente no puede especificar identidades ajenas. Las notificaciones abren la pregunta pública, sin copiar datos privados a canales externos.

## Validación
Confirmar por pruebas que no hay avisos hasta consentimiento explícito, que retirar el permiso impide nuevas alertas, que categorías sin seleccionar no disparan avisos y que los filtros de bloqueo y límites se respetan. Revisar especialmente la experiencia móvil.
