# RedLibertad V3.2.12 — Integración Social de Noticias + sitemap

Base estable: V3.2.11, PR #170, main `faa8de066de86d14fefbaafdfcc3a65124db2b74`.

## Qué se ha desarrollado

### Navegación con sesión real
- En las páginas públicas de Noticias, el enlace superior y el del dock móvil muestran «Mi inicio» cuando la sesión está válida. En ausencia de sesión mantienen «Entrar».
- Verificación ligera por `GET /api/auth/me`, `no-store`, mismo origen y sin introducir datos de cuenta en páginas indexables, caché ni HTML público.
- Preserva los iconos de navegación móvil, el perfil editorial y el resto de secciones.

### Descubrimiento en Inicio
- Las noticias que aparecen en «Noticias para conversar» se presentan como tarjetas tipo publicación social: avatar/logo de marca, perfil editorial identificado, titular, breve resumen, fuente original, Me gusta y comentarios reales.
- El enlace abre la noticia pública y su conversación completa; **no se escriben publicaciones falsas en el feed personal** ni se simulan likes/lectores.
- El endpoint existente `/api/editorial-social/discover` sigue devolviendo como máximo 3 artículos públicos y no retirados, ampliados con resumen y contadores agregados de acciones reales.
- CSS para móvil, tablet y escritorio con tipografía, colores y bordes de RedLibertad. Se actualiza el parámetro de versión del JS para invalidar caché.

### Mejoras en conversación
- Comentarios más compactos en móvil, avatares de inicial, texto más legible y botones táctiles. Sin inventar respuestas ni cambiar permisos/moderación.
- Publicaciones, perfiles, RSS y sistema editorial manual siguen aislados de la actividad de usuarios reales.

### Sitemap para Google
- Ya existía `/noticias/sitemap.xml` y `/sitemap-index.xml` lo incluía.
- Se añade también como línea explícita en `/robots.txt`.
- El sitemap de noticias deja de utilizar el límite de 50 elementos de las páginas públicas. Consulta únicamente artículos en vivo y perfiles preparados, con límite técnico de 49.000 artículos por archivo (reserva de 1.000 URLs para perfiles y la portada); no incluye noticias borrador o retiradas.
- Cada URL de noticia tiene canonical y el XML incluye `lastmod`. Sitemap no garantiza indexación; Google Search Console determina cobertura.

## Pasos de verificación
1. CI completo en verde, incluyendo `test:editorial-integration` y regresiones.
2. Verificar `/api/health` versión 3.2.12 tras desplegar y que `/noticias/sitemap.xml` devuelve XML correcto y URLs de noticias activas.
3. Comprobar que `/sitemap-index.xml` enlaza el sitemap de noticias y `/robots.txt` anuncia la ruta.
4. Abrir Noticias en incógnito: nav «Entrar» y formulario de comentario no activo.
5. Iniciar sesión: nav «Mi inicio», con iconos intactos en móvil; Me gusta y Comentar funcionan como antes.
6. Visitar Inicio: «Noticias para conversar» muestra noticias actuales con contadores reales y puede abrirse la página editorial. La sección se oculta si no hay ninguna noticia publicada.
7. Eliminar/retirar una noticia de prueba: deja de aparecer en Inicio y en el sitemap de Noticias.
8. Validar visualmente en móviles 360–430px y escritorio.
9. No modificar fuentes, perfiles, contenido editorial existente, chats, publicaciones sociales ni multimedia local.
