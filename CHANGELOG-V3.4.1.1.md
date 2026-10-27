# V3.4.1.1 — Presentación de enlaces de Facebook y otras redes

Motivo: una publicación externa se veía como una caja muy genérica sin imagen ni título original.

- Tarjetas más compactas, con icono diferenciado de Facebook, Instagram, TikTok y X, título y acciones claras.
- Para enlaces canónicos se conserva la opción de abrir la publicación dentro de RedLibertad mediante una pulsación consciente, además del acceso al original.
- Los enlaces cortos **no** prometen una vista integrada que no pueden proporcionar: muestran exclusivamente el botón para abrir el enlace original.
- Las vistas no inventan imágenes, títulos ni autores que las APIs externas no proporcionan; tampoco cargan contenido de terceros al entrar en Inicio.
- Mejora mobile-first: iconos, legibilidad, botones accesibles y menos espacio desperdiciado.
- Se actualizan los parámetros de versión de los recursos para que los navegadores reciban los cambios y se añade test de regresión.
- Sin cambios de base de datos, contenido almacenado, consentimiento, emails, monetización o reproductor YouTube.

Limitación: la disponibilidad del contenido externo sigue dependiendo de que sea público y de las restricciones del proveedor. Para obtener miniaturas y títulos reales haría falta un trabajo separado usando fuentes oficiales cuando existan y sin exponer datos privados.
