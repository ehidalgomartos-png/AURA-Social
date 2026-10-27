# V3.3.31 — Centro de crecimiento: actualización manual verificable

- Antes, pulsar «Actualizar» devolvía frecuentemente el mismo agregado en caché de 60 segundos. Ahora el botón solicita datos nuevos mediante un parámetro explícito de lectura admin.
- Las visitas normales y los cambios de periodo siguen reutilizando el cálculo durante 60 s; actualizaciones manuales repetidas en menos de 15 s reutilizan el último resultado. Las solicitudes concurrentes comparten el mismo cálculo.
- Se conservan privacidad, SQL agregado sin mensajes, permisos admin, métricas D1/D7 y fecha real de cálculo.
- El panel mantiene su apariencia actual. No se añaden emails, tracking ni métricas ficticias.
