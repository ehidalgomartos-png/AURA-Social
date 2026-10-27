# V3.3.23 — PWA móvil e insignias de actividad real

- Contador de mensajes pendientes más notificaciones ajenas a mensajes, sin duplicar el mismo mensaje.
- En iOS 16.4+ con la web instalada en inicio y permisos de insignias, la app actualiza el número 1, 2, 3… mediante la Badging API. No solicita permiso de forma automática.
- Android Chrome no ofrece una API para escribir números sobre el icono. Sigue utilizando su indicador del sistema ligado a notificaciones push, si están habilitadas; el número exacto depende del launcher.
- La sesión SSE de actividad existente actualiza el contador mientras la app está abierta. Al volver a primer plano realiza como máximo una consulta de badge cada 20 segundos, sin intervalos ni consulta estando oculta o sin conexión.
- El servicio push existente, si está habilitado y autorizado, acompaña una notificación real con el recuento privado obtenido en el servidor. El service worker puede actualizar el icono de iPhone en segundo plano.
- Si hay fallo de datos o falta de soporte, nunca interrumpe la navegación, el chat ni el envío de notificaciones.
- Se limpia al cerrar sesión o cambiar de usuario, conservando privacidad, autenticación y preferencias de push.
- Cache offline de la PWA renovada para incluir el nuevo controlador; no cachea API ni mensajes, preserva navegación móvil y las políticas anteriores.
- Sin correos, nuevas pantallas, actividad artificial, tareas periódicas, monetización ni alteraciones de preferencias.

Pruebas: recuentos exactos, permisos, iOS/Android, sesión, concurrencia, reconexión, seguridad de rutas y caché. Gate de JavaScript + PostgreSQL 18 previo a fusión y validación posterior. Coolify y pruebas reales en dispositivos requieren comprobación separada.
