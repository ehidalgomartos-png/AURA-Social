# RedLibertad V3.2.51.3 — Marketplace Price & Card Hotfix

Base: V3.2.51.2, main commit c50a308e920f5de8742dd07e74a90c17bbb2720c.

## Precio
El catálogo mostraba 15,99 €, pero la ficha pública mostraba 1.599,00 €.
Causa confirmada en código: displayPrice formateaba price_cents sin convertir céntimos a euros. JSON-LD Product.offers.price ya lo hacía correctamente.
Se divide entre 100 al presentar el precio en las fichas SSR, sin alterar datos en PostgreSQL.

## Tarjetas responsive
La imagen de la tarjeta se superponía al título, precio y ubicación en escritorio. El contenedor de medios ahora tiene overflow oculto, respeta las proporciones de productos con object-fit:contain y evita tamaños mínimos intrínsecos que desborden.
En teléfonos estrechos se muestra una tarjeta por fila, aprovechando el ancho completo. Las pantallas mayores siguen mostrando dos o tres columnas.

## SEO y caché
Se renueva la caché CSS con v=3.2.51.3 en páginas públicas y catálogo autenticado, conservando URLs, canonical, sitemaps, descripciones, imágenes y datos estructurados.

## Validación después del despliegue
1. Comprobar versión 3.2.51.3 en /api/health.
2. Verificar que la taza marca 15,99 € en ficha pública en ordenador y móvil.
3. Comprobar tarjetas sin superposición, imagen completa y texto legible en Marketplace y catálogo público.
4. Confirmar que Product.offers.price es 15.99 y priceCurrency EUR.
5. No volver a publicar: se conserva el anuncio original y sus fotos.

**No fusionar sin autorización expresa.**
