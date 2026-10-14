# RedLibertad V3.2.54 — Marketplace 2.0: Discovery & Trust

Base: `main` V3.2.53, commit `b33a2ff7eee422f72e56aa7b30b3ac4c5d53bd36`.

## Marketplace

- **Búsqueda por provincia y categoría:** filtros en el catálogo autenticado, además de ciudad, precio, operación y tipo. Todas las consultas siguen parametrizadas.
- **Ubicación y clasificación:** provincia y subcategoría son opcionales al publicar. Catálogo de sugerencias por producto, servicio e inmueble, sin impedir categorías libres como «Tazas». Los valores se guardan en `details` JSONB, por lo que no hay migración destructiva.
- **Edición segura:** se preservan `details` existentes (estado del producto, metros y habitaciones) al editar provincia o subcategoría.
- **Compartir:** enlace real a WhatsApp y Facebook y botón Copiar enlace en cada ficha pública. Compartir nativo en tarjetas privadas cuando el dispositivo lo permita; el enlace se copia como alternativa.
- **Perfil del anunciante:** enlace a `/perfil/:username` en fichas públicas y tarjetas cuando el perfil es descubrible.
- **Compra y venta diferenciadas:** mantiene las etiquetas «EN VENTA» y «BUSCO COMPRAR», con estilos mejor diferenciados.
- **Confianza:** formulario de denuncia en español con motivos claros y detalles opcionales; mantiene la API y los límites de denuncias existentes. En la ficha pública, denuncia mediante un enlace al Marketplace que pide iniciar sesión si corresponde.

## SEO

Las capturas de Rich Results Test aportadas muestran tres elementos válidos: Product snippet, Merchant listing y BreadcrumbList. Los avisos por `aggregateRating`, `review`, GTIN/marca y políticas de envío y devoluciones **son opcionales**. Se mantiene deliberadamente la ausencia de estos campos cuando el anunciante no ha proporcionado datos verificables.

Las meta-descripciones y descripciones JSON-LD pueden retirar exclusivamente sufijos de botones sociales importados, como `WhatsAppFacebookTwitter`, sin modificar el texto original del anuncio almacenado ni su contenido visible.

## Verificación obligatoria antes de fusionar

1. GitHub Actions SUCCESS, incluidas las nuevas regresiones `npm run test:marketplace-discovery`.
2. Desplegar `3.2.54` en Coolify **solo después de autorización expresa de fusión**.
3. Editar un anuncio existente y confirmar que mantiene fotos, precio, condición y metadatos anteriores.
4. Probar filtros de provincia y categoría; publicar un anuncio con subcategoría en móvil.
5. Comprobar vínculos WhatsApp, Facebook, copiar enlace y perfil del vendedor.
6. Denunciar un anuncio de prueba: confirmar envío y revisión desde Moderación.
7. Rich Results Test y sitemap del Marketplace: no deben aparecer campos comerciales inventados.

**No fusionar sin autorización expresa del usuario.**
