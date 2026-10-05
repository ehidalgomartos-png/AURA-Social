# RedLibertad V1.3.0 — Discovery & Engagement

Base estable: RedLibertad V1.2.0.

## Descubrimiento
- Buscador de publicaciones por texto, autor y #hashtag.
- Hashtags clicables en las publicaciones.
- Hashtags en tendencia de los últimos 30 días.
- Rankings: Tendencias, Más gustado, Más comentado y Nuevo.
- Feed de descubrimiento con tarjetas sociales completas.

## Guardados
- Guardar y quitar publicaciones con ☆ / ★.
- Sección Guardados dentro de Explorar.
- Persistencia por usuario mediante saved_posts.
- Creación idempotente de la tabla en runtime y definición añadida a db/schema.sql.

## Personas
- Las sugerencias muestran por qué aparecen: intereses en común o número de seguidores.
- Se mantiene la exclusión de cuentas administradoras de descubrimiento.

## Mobile-first
- Buscador adaptado a móvil.
- Chips de hashtags y filtros horizontales desplazables.
- Controles de guardado compactos en publicaciones.

## Compatibilidad
- /api/health actualizado a 1.3.0.
- Sin pasos manuales de migración necesarios para Guardados.
