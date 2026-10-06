# RedLibertad V1.48.0 — Push Notifications PWA

Base: V1.47.0 — Message Replies & Reactions.

- Web Push real y opt-in por dispositivo.
- Service Worker recibe push y abre deep links.
- push_subscriptions por usuario/dispositivo.
- push_jobs con trigger desde notifications.
- Worker con reintentos, expiración y limpieza 404/410.
- Respeta silenciados y bloqueados.
- No incluye cuerpos de mensajes ni multimedia sensible.
- VAPID opcional mediante PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY y PUSH_VAPID_SUBJECT.
- Si VAPID falta o es inválido, la app continúa sin push.
- Sin monetización.
