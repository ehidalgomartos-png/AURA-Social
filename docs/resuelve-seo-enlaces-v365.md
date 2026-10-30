# Resuelve V3.6.5 — SEO útil y enlaces internos de soluciones revisadas

## Objetivo
Mejorar la navegación de las páginas públicas sin crear contenido artificial ni vincular peticiones privadas, resultados sin revisar o páginas de temática vacías. Los enlaces deben servir a las personas antes que a los buscadores.

## Cambios

- La ficha independiente de una solución pública muestra ahora su tema, cuando exista, y hasta **tres soluciones relacionadas del mismo tema**, siempre que sean reales, autorizadas por el autor y aprobadas en revisión humana.
- La ficha incluye navegación tipo «Resuelve › Tema › Solución» y un marcado estructurado `BreadcrumbList` sin valoraciones, testimonios ni credenciales inventadas.
- Los enlaces hacia la landing temática solo aparecen cuando el tema posee **al menos tres soluciones públicas y revisadas**. Los enlaces a soluciones individuales siempre se obtienen de la consulta editorial filtrada.
- Las páginas temáticas incluyen rutas de navegación y enlaces a **otros temas suficientemente poblados**, según recuentos reales y filtrados por las mismas reglas.
- Los textos y nombres de soluciones se escapan antes de generar HTML, incluidos los títulos que contienen caracteres especiales. Los identificadores de enlaces se validan y las consultas SQL son parametrizadas.
- Se mantiene el diseño móvil con controles accesibles y navegación visible.

## Privacidad e indexación
Ningún enlace puede originarse de material que no cumpla **simultáneamente**: pregunta resuelta, consentimiento `seo_public_opt_in`, respuesta elegida todavía visible, aprobación editorial de esa misma respuesta, ambas cuentas activas, ausencia de exclusión de biblioteca y longitud mínima útil. Revocar consentimiento, ocultar una respuesta o desactivar una cuenta retira ese enlace en la próxima consulta.

La consulta de soluciones relacionadas devuelve únicamente `id`, `title` y recuento; no carga respuestas completas, mensajes, datos de contacto ni denunciantes. El listado público de los temas respeta las condiciones existentes: un tema con menos de tres soluciones válidas no puede indexarse.

## Validación
Pruebas de SQL, revocación, enlaces permitidos, navegación, XSS, SEO y versión móvil. No fusionar sin GitHub Actions completo y PostgreSQL 18 correctos. Confirmar los cambios desplegados en Coolify por separado. No se garantiza indexación en Google.
