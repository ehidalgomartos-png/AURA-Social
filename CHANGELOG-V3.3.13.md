# V3.3.13 — Reintentos fiables en Explorar móvil

- La pestaña activa solo queda marcada como cargada si todas sus peticiones terminan con resultado correcto; respuestas HTTP fallidas o respuestas de búsqueda obsoletas no se almacenan como éxito.
- Personas conserva su mensaje y acción de reintentar; Publicaciones y Tendencias muestran un botón de reintento en lugar de mantener un bloqueo silencioso.
- Ante fallos al obtener círculos o conexiones privados, se conservan los datos anteriores y no se transforma un error temporal en una lista vacía.
- Sin cambios de base de datos, permisos, visibilidad de publicaciones, monetización ni actividad artificial.
- Validación exigida: sintaxis JavaScript, regresiones de Explorar, suite y PostgreSQL 18.
