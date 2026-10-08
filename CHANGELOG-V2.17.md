# RedLibertad V2.17.0 — Verificación segura de despliegues

**Base estable:** `67ae8d83df80a5d872b72a65fa348593cf200288` (V2.16 fusionada, PR #146).

## Implementado
- Nuevo verificador interno `createReleaseVerifier` que solo hace lecturas HTTP al loopback fijo `127.0.0.1` y al puerto de la aplicación.
- Comprobaciones: `/api/health` (versión exacta y ok), `/api/ready` (PostgreSQL), `/app`, `/manifest.webmanifest`, `/sw.js`, `/robots.txt`, `/sitemap-index.xml`.
- GET únicamente para los dos endpoints JSON; HEAD para los recursos públicos. Sin operaciones que creen, editen o borren datos.
- Timeout de 2,5 segundos por comprobación, ejecutadas en paralelo; informe en memoria reutilizable durante 30 segundos.
- Estado crítico si la versión o la base de datos fallan, aviso si falla PWA, interfaz o SEO.
- Nueva ruta administrativa `GET /api/admin/ops/release-verification` con `requireAdmin`, `Cache-Control: no-store` y refresco explícito opcional.
- Pantalla mobile-first para ver resultados y recomendaciones de diagnóstico desde Administración.
- Respuestas sin credenciales, errores brutos, rutas dinámicas ni acceso a destinos indicados por el usuario.
- 15 pruebas nuevas de versión, servicios, exclusión de SSRF, tiempos límite, cache, concurrencia, permisos y regresión UI; integración CI.

## Límites y garantías
- Se verifica **solo el servidor interno de esta instancia**; no valida la URL pública, el proxy/CDN, el certificado TLS ni el despliegue de Coolify.
- Tampoco comprueba el funcionamiento real de medios privados, chats, push en dispositivos o backups. Estas funciones requieren smoke manual controlado.
- Sin cambios en el esquema de PostgreSQL ni acciones sobre publicaciones, usuarios, multimedia o monetización.
- No confundir las 7 comprobaciones exitosas con 'producción validada'.

## Validación del despliegue cuando se autorice la fusión
1. Exigir Actions verdes y fusionar solo con aprobación.
2. Comprobar Coolify: revisión desplegada, logs de inicio y volumen persistente.
3. Confirmar la respuesta pública de `https://redlibertad.com/api/health` con `version: 2.17.0` y `/api/ready` con `ok:true`.
4. Entrar en Administración → Verificación de la versión → Comprobar ahora; revisar los siete resultados.
5. Probar en móvil login, feed, post, comentarios, chat, media y Stories. Confirmar PWA y notificaciones.
6. Comprobar robots, sitemaps y perfil público desde un navegador anónimo; validar que el contenido privado no es indexable.
