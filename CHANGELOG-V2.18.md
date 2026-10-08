# RedLibertad V2.18.0 — SEO y captación 3.0

**Base:** `f979b68822945ffab32d976dcde96276e015ee7e` — V2.17.0 fusionada (#147).

## Funcionalidad implementada
- Nuevo índice editorial público `/guias` y tres guías originales: primeros pasos, privacidad y consentimiento, y encontrar personas/comunidades.
- Todas son páginas HTML renderizadas por servidor, utilizables antes de registrarse y adaptadas a móviles, sin rastreadores externos ni servicios adicionales.
- Títulos y meta descripciones específicos, URLs canonical, Open Graph/Twitter y marcado Schema.org Article, CollectionPage y BreadcrumbList.
- Sitemap independiente `/sitemap-guias.xml` con 4 URLs aprobadas y fechas de modificación editoriales explícitas; enlazado desde sitemap-index.xml y robots.txt.
- Enlaces desde portada y footer para facilitar descubrimiento e interconexión de páginas.
- CTA Crear cuenta / Entrar que conserva la guía de origen con `entry=guide`, `entryKey` y `next`, respetando la validación del cliente y servidor; sin redirecciones externas, inyección de rutas ni parámetros ajenos.
- La atribución reutiliza `signup_attributions` y el tablero de captación que ya existen. Se registra únicamente cuando la persona se registra; sin añadir cookies publicitarias ni proveedores.
- Panel SEO administrativo ampliado para incluir el recuento de guías y su sitemap.
- No se modifican perfiles privados, publicaciones sensibles, algoritmos ni visibilidad de usuarios.
- Suite propia de pruebas de rutas HTML, sitemap, metadatos, seguridad de atribución, experiencia móvil y regresión con GitHub Actions.

## Alcance y limitaciones
- Las guías son editoriales estáticas, no nuevas páginas dinámicas generadas automáticamente para palabras clave.
- Pueden ser rastreadas e indexadas, pero Google decide si aparecen y en qué posición: el posicionamiento y la llegada de tráfico no se pueden garantizar.
- El dashboard existente informa registros y activación con atribución; no mide clics de todos los visitantes ni atribuye registros que no provienen del CTA.
- Se incorpora un tipo de atribución `guide`, validado con ruta relativa y sin datos personales adicionales.
- Sin cambios destructivos en PostgreSQL, publicaciones, usuarios, vídeos ni monetización.

## Validación antes y después de fusionar
1. Exigir GitHub Actions completamente correctas en el PR. No fusionar sin autorización.
2. Tras la fusión y despliegue, comprobar Coolify y `/api/health` con versión `2.18.0`.
3. Abrir `/guias` y las tres guías desde móvil y comprobar la navegación con y sin sesión.
4. Revisar en la web pública los metadatos, `sitemap-guias.xml`, `sitemap-index.xml` y `robots.txt`.
5. Probar CTA de registro y login con guía de origen; comprobar retorno local y atribución únicamente con cuenta de pruebas autorizada.
6. Comprobar que perfiles privados, contenido sensible y páginas de cuenta mantienen su política SEO anterior.
7. Enviar sitemap-index.xml en Search Console una vez desplegado, sin afirmar indexación ni resultados hasta disponer de datos.
