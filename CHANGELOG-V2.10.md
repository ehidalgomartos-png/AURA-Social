# RedLibertad V2.10.0 — Notificaciones 3.0

## Novedades
- Preferencias de Web Push por cuenta y categoría: mensajes, menciones, interacciones, comunidad, consentimientos y sistema.
- Tabla `push_preferences` con valores heredados permisivos y preferencias estrictamente booleanas.
- `GET /api/push/config` y nuevo `PUT /api/push/preferences` autenticado, con validación de cuenta.
- El trabajador de push consulta las preferencias en el momento del envío y respeta incluso cambios sobre trabajos pendientes.
- Las preferencias afectan solo al aviso del dispositivo. No borran ni desactivan las notificaciones internas.
- Controles móviles en Cuenta y seguridad, disponibles incluso cuando un dispositivo no soporta Web Push.
- Filtro «Sin leer» y actualización de contadores confirmada por el servidor tras marcar notificaciones.
- Gestión de errores de red sin falsas confirmaciones en «Marcar todo leído».
- 12 nuevas pruebas y suite `npm run test:notifications` en CI; app, health, PWA y panel admin a V2.10.0.

## Sin cambios
- El usuario debe seguir autorizando push por dispositivo. No se fuerzan permisos.
- No se añaden correos automáticos, digest o recordatorios fuera de la app.
- Sin cambios en contenido de publicaciones, mensajes, moderación ni monetización.

## Validación pendiente
- Pruebas reales en Coolify, dispositivos y con VAPID configurado siguiendo checklist #59.
