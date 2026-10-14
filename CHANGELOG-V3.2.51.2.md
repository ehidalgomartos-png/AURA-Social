# RedLibertad V3.2.51.2 — Marketplace API Routing Hotfix

**Base:** V3.2.51.1, commit `5f77440cdd2da3efb26825d5648d9b27df03745e`.

## Causa confirmada en el código

El middleware inicial de `/api/marketplace` esperaba a `ensureMarketplaceSchema()`, pero **no llamaba a `next()` si la preparación terminaba correctamente**:

`router.use(wrap(async()=>{await ensureMarketplaceSchema();}));`

Por ello, la foto se almacenaba mediante `/api/media/upload`, pero la petición posterior POST `/api/marketplace` no alcanzaba nunca el INSERT. El navegador acababa mostrando un timeout a los 30 segundos. Lo mismo podía suceder con «Mis anuncios», «Explorar» y «Favoritos» porque pasan por el mismo middleware.

## Corrección

- `marketplaceSchemaMiddleware` llama una sola vez a `next()` al finalizar con éxito.
- Si la preparación falla, transmite el error a Express.
- Sin cambios en el esquema PostgreSQL, los datos ni la gestión de fotografías.
- Pruebas para éxito, espera asíncrona y errores, además de contratos de rutas.
- Actualización de versión a **3.2.51.2** y cache busting de scripts.
- No hay datos que migrar.

## Después del despliegue

1. Verificar `/api/health` con `version: 3.2.51.2`.
2. Abrir Marketplace, comprobar que «Explorar» y «Mis anuncios» terminan de cargar.
3. **Antes de repetir el envío**, comprobar que no hay duplicados de la taza.
4. Con el formulario actual, publicar la taza una única vez; las fotografías ya cargadas en el editor no necesitan subirse de nuevo mientras permanezcan en la vista.
5. Comprobar URL pública `/marketplace/p/:id/:slug` y `sitemap-marketplace-1.xml`.

**El PR no debe fusionarse sin la autorización explícita del usuario.**
