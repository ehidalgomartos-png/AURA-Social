# V3.3.17.1 — Centro de actividad restaurado con arranque protegido

## Incidente verificado
El primer intento V3.3.17 incorporó la nueva ruta `/admin/actividad` como `app.get(...,requireAdmin,...)` pero `server.js` solo importaba `requireAuth`. Eso dejaba `requireAdmin` sin definir al registrar la ruta, provocando una excepción al arrancar la aplicación. Coolify indicó `Success` para la fase de despliegue, mientras la verificación HTTP de GitHub obtuvo `health_http_error`.

## Correcciones
- Importación explícita de `requireAdmin` en el servidor, junto con `requireAuth`.
- Página HTML fuera de `public/`, servida exclusivamente mediante `/admin/actividad` con `requireAdmin` (los assets CSS y JS públicos no contienen datos de usuario).
- Pruebas específicas que extraen del servidor la importación y la ruta y las evalúan juntas para detectar una función de autorización sin definir antes de desplegar.
- Se mantienen las pruebas de permisos de la API, métricas agregadas, contenido de cronología limitado a publicaciones públicas y protección de mensajes privados.
- No se alteran tablas, permisos de usuarios, monetización ni mensajes privados. El Centro de actividad es de solo lectura.

## Validación requerida
Suite general, pruebas específicas y PostgreSQL 18 deben estar en verde antes de fusionar. Tras la fusión, comprobar SHA publicado, `/api/health` y preparación de PostgreSQL; no considerar suficiente el estado `Success` de Coolify por sí solo.
