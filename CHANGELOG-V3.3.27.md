# V3.3.27 — Recuperación móvil/PWA tras reconexión

- Escucha únicamente el cambio de conectividad online para reintentar comprobaciones PWA ya presupuestadas (una actualización del service worker por hora).
- En instalaciones compatibles, reconcilia los contadores reales al volver Internet, solo con sesión identificada y app visible.
- No se añaden sondeos, temporizadores, recargas forzadas, notificaciones, menús ni cambios de diseño; respeta el modo offline y la privacidad.
- Versionado de los scripts en portada e Inicio para evitar copias antiguas en caché, con regresión automatizada de reconexión visible/oculta.
