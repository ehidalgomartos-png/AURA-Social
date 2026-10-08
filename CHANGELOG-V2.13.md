# RedLibertad V2.13.0 — Observabilidad y fiabilidad 3.0

## Base y alcance
- Parte directamente de `bdcb7a63fb48294ae730215693faebc98f0949cc` (V2.12 estable; PR #142 fusionado).
- Sin cambios en PostgreSQL, publicaciones, usuarios, mensajes, fotos ni vídeos. Monetización aparcada.

## Implementación real
1. Instrumentación de solicitudes `/api/` desde el inicio de la cadena Express, capturando también errores y respuestas 429.
2. Estadísticas agregadas de **15 minutos** en memoria, por categorías fijas de rutas (sin IDs ni parámetros), con peticiones, errores 4xx/5xx, rate-limit, llamadas lentas, tiempo medio y cota superior aproximada del p95.
3. Ventanas agregadas con máximo de 12 categorías y 15 minutos, sin crecimiento por ruta específica o usuario; se descartan ventanas antiguas.
4. Las conexiones SSE y las comprobaciones `/api/health`, `/api/ready` y el propio panel se excluyen de las métricas para no distorsionar los tiempos.
5. La lectura de estadísticas está disponible únicamente mediante GET `/api/admin/ops/runtime`, protegido con `requireAdmin` y `Cache-Control: no-store`.
6. Panel responsive de diagnóstico en Administración, con refresco manual, resumen de peticiones/errores/lentitud/memoria y desglose por áreas.
7. Alertas informativas (sin suspensiones automáticas ni bloqueos) para patrones de fallos; muestras pequeñas se indican explícitamente.
8. Se sustituye el registro genérico de rutas lentas que podía mostrar identificadores dinámicos por métricas agregadas sin rutas concretas.
9. 12 pruebas nuevas en CI para límites de memoria, privacidad, desconexiones, SSE, estadísticas y protección administrativa.

## Consideraciones de operación
- Las estadísticas se recopilan **solo por proceso de Node.js**; no están sincronizadas entre instancias y se reinician en cada despliegue.
- No reemplaza a herramientas de observabilidad externas; no mide por sí misma tiempos reales de renderizado en móviles.
- Los percentiles se aproximan mediante histogramas, y un valor de 10 s indica 10 s o más.
- Si Coolify ejecuta varias réplicas, las cifras del panel representan únicamente aquella que atendió la petición.
- El servicio no hace consultas SQL adicionales ni altera la disponibilidad de la API por registrar métricas.

## Validación
- Comprobar GitHub Actions en el PR y no fusionar sin autorización expresa.
- Tras autorizar el merge, revisar Coolify y verificar `/api/health` con versión `2.13.0`.
- Entrar en la administración desde móvil, refrescar el panel y comprobar métricas por categoría.
- Validar feed, chat, login, publicaciones, alertas 429, push y caché PWA.
- No declarar producción validada sin inspección en Coolify y pruebas manuales.
