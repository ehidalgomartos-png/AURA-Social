# Resuelve V3.5.30 — SEO técnico y sitemap conservador

El sitemap `/sitemap-resuelve.xml` contiene exclusivamente las fichas `/resuelve/solucion/:id` de soluciones aprobadas manualmente **con consentimiento expreso vigente** de quien publicó la pregunta. No se publican preguntas abiertas, perfiles, conversaciones, respuestas ocultas ni soluciones retiradas.

## Reglas de inclusión
Pregunta resuelta y opt-in, biblioteca no excluida, respuesta elegida visible y aprobada, texto mínimo, autor de la pregunta y autor de la respuesta activos. La consulta del sitemap usa las mismas condiciones que la ficha pública. Cuando se retira el permiso o una de estas condiciones deja de cumplirse, la URL desaparece del sitemap y responde 404/noindex. El sitemap se sirve sin caché para respetar revocaciones y está limitado a 2000 entradas en esta versión.

El sitemap queda anunciado en `/sitemap-index.xml` y `/robots.txt`. Los enlaces internos desde la biblioteca solamente aparecen en soluciones que han optado a tener página independiente.

## Datos estructurados
Cada página publicada lleva un bloque JSON-LD de tipo `Article` con título, breve descripción, idioma, dirección canónica y editor de la web. El JSON queda escapado para que textos de usuario no puedan cerrar la etiqueta `script`. **No se inventan valoraciones, estrellas, testimonios, premios ni titulaciones verificadas.**

## Seguimiento
La presencia en un sitemap no garantiza indexación en Google, que puede tardar o rechazar las páginas. La ausencia del sitemap tampoco garantiza desindexación inmediata. Para acelerar una retirada ya indexada se requerirán las herramientas adecuadas de Search Console y la recrawl real.

Revisar GitHub Actions y PostgreSQL 18 antes de fusionar. Comprobar despliegue y sitemap real por separado en Coolify.
