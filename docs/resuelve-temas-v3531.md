# Resuelve V3.5.31 — Páginas públicas por temas

## Objetivo
Organizar soluciones **reales y autorizadas** en cinco temas: Hogar, Tecnología, Trámites, Estudios y Vida cotidiana. Resuelve no debe parecer una tienda ni publicar páginas artificiales solo para captar visitas de Google.

## Clasificación voluntaria
La persona que crea una pregunta puede escoger uno de los cinco temas o no escoger ninguno. El campo `resuelve_questions.topic` es opcional y está restringido a un conjunto de valores permitido en PostgreSQL. Quien escribió una pregunta existente puede añadir, modificar o borrar su tema desde el detalle, con autenticación, comprobación de titularidad, protección de origen y límite de frecuencia. **Cambiar el tema no modifica ni activa el consentimiento SEO.** Ninguna clasificación se deduce automáticamente de preguntas o datos personales.

## Contenido público y requisitos
Las rutas `/resuelve/temas/{hogar|tecnologia|tramites|estudios|vida-cotidiana}` son páginas HTML servidas por el servidor. Incluyen descripciones editoriales generales y enlaces a soluciones que cumplen **todas** las condiciones siguientes:

- Pregunta resuelta, con respuesta elegida que sigue visible.
- Respuesta y pregunta cumplen las longitudes mínimas de la biblioteca.
- Revisión humana aprobada para esa misma respuesta.
- Cuenta activa tanto de quien preguntó como de quien respondió.
- La pregunta no ha sido excluida de la biblioteca.
- **Permiso SEO individual y vigente del autor de la pregunta.**
- Tema explícito seleccionado, no supuesto.

Una página sin soluciones responde **404 con noindex**. Con una o dos soluciones responde con **noindex,follow**, por lo que no se crean páginas vacías indexables. Con al menos tres soluciones que cumplen las condiciones anteriores se habilita `index,follow` y `canonical`. Se muestran hasta 16 soluciones revisadas, con enlaces a sus fichas individuales. No se inventan consejos, testimonios, reseñas ni puntuaciones; los textos de usuarios se escapan correctamente.

## Sitemap y navegación
- `/sitemap-resuelve-temas.xml` solo incluye temas con al menos **tres** soluciones autorizadas y aprobadas.
- Se incorpora al índice de sitemaps y a `robots.txt`.
- La sección «Explora soluciones por temas» en la biblioteca solo enlaza temas suficientemente poblados. Si no existen, muestra un aviso sin cifras inventadas.
- Los recuentos se ofrecen desde una API pública de solo lectura, sin nombres de usuarios ni textos privados.

## Privacidad, posicionamiento y operaciones
Retirar el consentimiento SEO, esconder una respuesta, revocar su aprobación o desactivar una cuenta hace que la solución deje de contar y de aparecer en las páginas temáticas y el sitemap. Una revisión de Google puede tardar en reflejar una retirada, y ninguna inclusión en el sitemap garantiza la indexación.

## Validación
Pruebas de autenticación y titularidad, filtros editoriales, recuentos, páginas vacías, datos escapados, móvil, sitemap y PostgreSQL 18. Fusionar solo tras GitHub Actions en verde y confirmar producción en Coolify por separado.
