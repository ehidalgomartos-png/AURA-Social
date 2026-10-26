# V3.3.6 — PWA móvil: menos comprobaciones de actualización

- El registro del service worker sigue siendo el mismo y mantiene `updateViaCache: none`.
- En lugar de comprobar una versión nueva en **cada regreso a la pestaña**, se limita a una comprobación por hora cuando hay conexión y el documento está visible.
- No se realizan comprobaciones en paralelo; si hay un fallo temporal, se puede volver a intentar después de cinco minutos sin saturar una conexión lenta.
- Se mantiene el registro al cargar, la instalación Android/iOS, las notificaciones push y la limpieza de caché existente. La instalación y los datos privados no se modifican.
- Sin cambios de base de datos, experiencia visual, monetización ni tracking.
- Pruebas con pestañas repetidas, desconexión, visibilidad, reintentos, concurrencia y regresiones existentes.

**Nota:** se trata de reducir comprobaciones de red redundantes, no de medir una aceleración en producción ni garantizar instalación en dispositivos sin navegador compatible.
