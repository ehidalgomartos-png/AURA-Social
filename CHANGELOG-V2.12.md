# RedLibertad V2.12.0 — Rendimiento 3.0

**Base exacta:** `24610a90c0226ba6356d5ca72f8c3f73615ed11c` (V2.11.0, PR #141).

## Cambios implementados
- Service worker V2.12: caché de recursos estáticos acotada a 64 entradas y limpieza automática de versiones PWA previas.
- HTML sin caché de parámetros privados: se guardan únicamente los shells `/` y `/app` para navegación sin conexión.
- Nunca se interceptan ni cachean solicitudes de API, archivos de usuario en `/uploads`, rutas de publicaciones `/p`, administración, vídeo o peticiones HTTP Range.
- CSS, JS y manifiesto: estrategia **network-first** con fallback offline para evitar que el móvil continúe ejecutando una versión antigua.
- Imágenes estáticas decorativas: caché con revalidación en segundo plano y acotación de entradas.
- Primera imagen del feed: `loading=eager`, `fetchpriority=high`; las siguientes conservan `loading=lazy`.
- Vídeos de feed, tiles y chat: `preload=none` hasta interacción; visor de Stories en primer plano carga metadatos, conservando controles y reproducción.
- Cabeceras HTTP diferenciadas: archivos HTML/SW sin cacheo obsoleto, código revalidable e imágenes de diseño con caché temporal.
- Archivos multimedia del usuario: caché **privada** del navegador por una hora, sin almacenar en cachés compartidas, manteniendo `express.static` y solicitudes por rangos.
- Diez tests nuevos de regresión con GitHub Actions, más las suites existentes.

## Seguridad y datos
No cambia el esquema de la base de datos, no borra publicaciones/usuarios y no transforma ni pierde archivos subidos. No se toca monetización. La app móvil conserva push, deep links, offline shell y PWA.

## Validación posterior a la fusión autorizada
1. Confirmar CI verde en el PR. No fusionar sin autorización expresa.
2. Desplegar en Coolify y comprobar la versión `2.12.0` en `/api/health` y base `/api/ready`.
3. Navegación móvil con wifi/datos lentos: primer post visible, imágenes siguientes y vídeos del feed.
4. Probar vídeo local completo y saltos de reproducción (HTTP Range), Stories y Reels.
5. PWA instalable, actualización de código, entrada offline y notificaciones push al abrir la app.
6. Verificar contenido +18 y cuentas privadas sin fugas hacia el cache de Service Worker. No dar producción por validada sin estas comprobaciones.

## Limitaciones conocidas
No añade transcodificación ni versiones redimensionadas de vídeos/imágenes: requeriría analizar formatos existentes, persistencia y pipeline de medios para evitar pérdida de datos. El efecto real en tiempos de carga se debe medir en dispositivo/red de producción.
