# RedLibertad V2.6.0 — Stability & Quality Audit

## Correcciones y protecciones
- Login y alta: prevención de doble envío mientras hay una petición pendiente; restauración del botón y mensaje comprensible ante errores de red.
- Push/PWA: los enlaces de notificaciones solo pueden navegar a rutas `/app` del mismo dominio. Rechaza destinos externos, esquemas peligrosos y rutas sensibles.
- PWA: no almacenar en caché las rutas raíz /api, /uploads ni /p, además de sus subrutas.
- El mensaje de inicio del servidor ya muestra `APP_VERSION` y no una versión antigua.

## Calidad y comprobaciones
- Comprobación de sintaxis automática de todos los JS de servidor, src, public, db, scripts y tests.
- Smoke tests unitarios: autenticación, PWA, assets precache, navegación push, superficies y rutas sociales.
- GitHub Actions ejecuta pruebas legales y smoke tests nuevos.
- Comando read-only `npm run smoke:production -- https://redlibertad.com` para revisión tras despliegue (health, readiness, SEO, /app y endpoints privados).
- Matriz manual P0/P1, criterios de aceptación y rollback en `AUDIT-V2.6.md`.
- Versión/feature flags, cache PWA, admin, README y checklist actualizados.

## No cambia
- Rutas ni datos de publicaciones, mensajería, Reels, Stories, cuentas y consentimientos.
- Schema de PostgreSQL, monetización ni textos legales.
- Configuración real de Coolify; la validación y los backups deben revisarse allí.

## Pendiente de verificar en producción
- Despliegue 2.6.0, smoke HTTP, pruebas en Android/iOS/escritorio y revisión funcional real de las áreas de la matriz. Los controles automatizados no sustituyen esas validaciones.
