# RedLibertad V3.0.1 — Hotfix Search Console + Stories + Portada + Conexiones

Base estable exacta: V3.0.0 (merge PR #151), commit `86bcf6105fd59f810a7737d236d39451834ba4f6`.

## Errores reportados (capturas del 8/10/2026)

1. Search Console denuncia 'Falta etiqueta XML: url' en `/sitemap-topics.xml` y sitemaps con cero páginas descubiertas. Causa identificada: cuando ninguna URL dinámica cumple los filtros públicos, los módulos generaban `<urlset>` sin elementos `<url>`.
2. Algunos mapas se muestran como 'No se ha podido obtener' en Search Console. Este mensaje también puede deberse a respuestas HTTP de error o al estado del último despliegue; no se puede afirmar que haya quedado corregido únicamente cambiando el XML sin leer logs de Coolify.
3. Pulsar «Stories sin ver» solo desplazaba la página al carrusel, sin abrir la historia pendiente.
4. Las fotografías de portada se recortaban por `background-size:cover`, en escritorio, móvil y vista previa.
5. Los filtros «Favoritas» y «Cercanas» usaban estilos de chips claros para fondo oscuro, pero en el panel de Conexiones aparecen sobre fondo claro.

## Correcciones

- Todos los sitemaps dinámicos de temas, reels, eventos, comunidades, hashtags y perfiles incluyen al menos una URL real de directorio **público y canónico** cuando no hay contenidos individuales que indexar (`/temas`, `/reels`, `/eventos`, `/comunidades`, `/publicaciones`, `/perfiles`). No se insertan publicaciones privadas ni contenido sensible.
- El índice existente `/sitemap-index.xml` sigue siendo el punto de entrada de los sitemaps. Los errores HTTP 500 todavía exigirán examinar el servicio/BD con Coolify.
- Al pulsar «Stories sin ver» se refresca el carrusel y se abre la primera Story pendiente accesible de otra persona; si no queda ninguna, se informa y se desplaza al carrusel.
- Cuando se marca una Story como vista, se refresca el contador de pendientes.
- Portada y vista previa usan `background-size:contain`, fondo marino y reglas responsivas: imagen entera sin recorte. Puede quedar espacio de fondo alrededor de imágenes con proporciones distintas.
- Filtros de círculos en el Centro de Conexiones con texto oscuro, borde visible, estado activo y foco accesible.
- Se mantiene el contenido, permisos, publicaciones, multimedia, usuarios, edad y monetización existentes.

## Validación

1. Exigir GitHub Actions verdes antes de fusionar, sin cambios en `main` antes de autorización expresa.
2. Tras fusionar y desplegar, confirmar `https://redlibertad.com/api/health` con `version:"3.0.1"`.
3. Abrir cada sitemap y comprobar respuesta HTTP 200, `application/xml`, XML con `<urlset>` y al menos un `<url><loc>` absoluto. Si hay un 500, revisar los registros específicos del backend y PostgreSQL en Coolify.
4. En Search Console, usar el índice `https://redlibertad.com/sitemap-index.xml` y solicitar nueva lectura; las cifras no se actualizan de inmediato. No enviar todas las subpáginas manualmente si el índice ya las contiene.
5. Entrar con una cuenta que tenga Stories nuevas: pulsar «Stories sin ver», confirmar apertura, contador actualizado y fallback si se agotaron.
6. Probar portada de paisaje y retrato en móvil y ordenador: imágenes completas, sin recorte ni ocultación del avatar; comprobar vista previa de edición.
7. Abrir Conexiones sobre tema claro y revisar Favoritas/Cercanas, filtros seleccionados y controles táctiles.
8. Confirmar subida de imágenes, publicaciones, chat y permisos sin regresiones.

## Límites

- No hay acceso confirmado a Coolify ni a Google Search Console: corrección estática y CI no prueban rastreo o indexación real.
- En una imagen cuya relación de aspecto no coincide con la franja, `contain` deja bandas para evitar cortar el contenido.
- No se modifican datos históricos ni se automatiza la revalidación en Google.
