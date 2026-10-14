# RedLibertad V3.2.51 — Marketplace SEO público

**Base:** `main` V3.2.50, merge PR #221 (9ebcf23d7a8a45f5a7cfdbef777f7e2d113a3bbe).

## Implementado
- Página pública por anuncio activo: `/marketplace/p/:id/:slug`, HTML renderizado en servidor, URL legible y canónica, título, descripción, precio, ciudad, fechas y fotografía, con vista móvil.
- Datos estructurados JSON-LD: Product + Offer en artículos, Service en servicios, RealEstateListing con Accommodation en inmobiliaria. Solo se publica información existente; no inventar reseñas, valoraciones, gastos de envío ni políticas de devoluciones.
- Imágenes públicas de anuncios activos en `/marketplace/imagen/:id/:index`, sin liberar globalmente `/uploads/` a Googlebot.
- Página pública con enlaces de descubrimiento `/marketplace/explorar`. Enlace desde la portada pública y desde el Marketplace de miembros.
- Sitemap índice `/sitemap-marketplace.xml` con sub-sitemaps de 2000 anuncios (`/sitemap-marketplace-1.xml`, etc.), último cambio e imagen de cada anuncio si existe.
- Incorporación al sitemap general y `robots.txt`, manteniendo la prohibición de rastrear /uploads y /api.
- Anuncios pausados/ocultos/no descubribles no son accesibles al público ni aparecen en el sitemap. Vendidos devuelven 410.
- Enlaces canónicos reescritos con 301 si cambia el titular. Contactar sigue exigiendo sesión y acción del visitante.
- Pruebas regresión y verificación de SEO/canonical/XSS en CI.

## Verificación de producción tras despliegue
1. Abrir como visitante (modo incógnito) `https://redlibertad.com/marketplace/explorar`.
2. Publicar anuncio real con foto y verificar URL `/marketplace/p/ID/slug`, contenido sin login y su vista móvil.
3. Revisar código fuente (title/description/canonical/JSON-LD/Product/Offer).
4. Comprobar `/sitemap-marketplace.xml` y `/sitemap-marketplace-1.xml`.
5. Solicitar indexación en Google Search Console, registrar sitemap y usar **Rich Results Test** para productos.
6. Pausar/ocultar/vender y verificar 404/410 y retirada del sitemap.

**Nota:** Sitemap, datos estructurados y rastreabilidad favorecen el descubrimiento pero no garantizan indexación ni resultados enriquecidos. Las reglas de Google para Product pueden restringir bienes regulados o prohibidos. Los servicios y anuncios inmobiliarios no tienen garantizado un resultado enriquecido específico.

**No fusionar sin autorización expresa.**
