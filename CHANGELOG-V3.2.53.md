# RedLibertad V3.2.53 — Marketplace Compra / Busco y edición

**Base:** V3.2.52 (`main` dcce...? No; commit 679aa18126d19a9563c820db7f4e554847106a74).

## Problema al editar anuncios
Confirmada una incompatibilidad de Zod 3.24.2: `listingInput` está refinado con `superRefine`, que devuelve `ZodEffects`, y `listingInput.extend({...})` en PATCH causa error de servidor en lugar de guardar.
La nueva versión deriva creación y edición de un esquema base sin refinar (`listingBase`). Aplica las mismas reglas a ambos; PATCH valida `status`, ownership y el resto de datos. No altera anuncios antiguos.

## Venta y Compra / Busco
- Los anuncios de productos pueden indicar **En venta** o **Compra / Busco**.
- Los anuncios inmobiliarios admiten **venta, alquiler o compra / busco**; los servicios mantienen oferta.
- Al buscar comprar, el precio pasa a ser **presupuesto máximo** y puede ser 0 € si es negociable.
- Filtros públicos y privados para Venta y Compra; distintivo visual «BUSCO COMPRAR» en anuncios.
- Se amplía de forma idempotente la restricción CHECK `marketplace_listings_deal_check` para aceptar `buy`, sin borrar los datos existentes.
- Las fichas públicas mantienen URL, título, fotografías y sitemap. En anuncios de búsqueda, el JSON-LD utiliza `WebPage` y `about Product` o `Accommodation`, nunca un `Offer` de vendedor inexistente.

## Validación
1. GitHub Actions con prueba real de Zod 3 de creación, edición, validación de `status`, operación y SEO, más regresiones existentes.
2. Verificar `/api/health` devuelve `3.2.53` después de desplegar.
3. Entrar en Mis anuncios, editar la taza existente y guardar; comprobar cambios reflejados sin perder fotos.
4. Crear anuncio «Busco comprar» con presupuesto y comprobar filtro Compra en móvil y catálogo público.
5. Verificar su URL pública y que JSON-LD no inventa una oferta de venta; verificar sitemap.

**No fusionar sin autorización del propietario.**
