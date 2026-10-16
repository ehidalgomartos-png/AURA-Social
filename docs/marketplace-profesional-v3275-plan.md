# RedLibertad V3.2.76 — Tiendas externas (nuevo rumbo)

**Decisión del propietario:** los vendedores WooCommerce/PrestaShop/Shopify tienen ya checkout. RedLibertad proporciona visibilidad, búsqueda, fotos y chat; el comprador completa pago, envío y devoluciones en la **tienda original del vendedor**, no en RedLibertad.

## Alcance V3.2.76
- Enlace opcional HTTPS a ficha original, solo para productos en venta; el dominio debe coincidir con website_url del perfil del vendedor. No se considera verificación legal de propiedad.
- Botón marcado «Comprar en la tienda externa», salida transparente a otro dominio. Contacto por chat permanece.
- Importación CSV: reconoce Product URL, Permalink o Enlace del producto si se incluye la columna. No inventar enlaces a partir de SKU, ID o slug.
- Anuncios anteriores y sin tienda mantienen su flujo normal. No cobros, pedidos, iframe de tienda ni Stripe Connect.
- En una fase posterior: verificación formal de la propiedad del dominio, sincronización segura de precios/stock y variaciones, posiblemente exportador/plugin WooCommerce, respetando el consentimiento del vendedor.

## Requisitos de Google
- Cada vendedor utiliza Merchant Center con SU dominio verificado y URLs reales de su producto en su tienda; precio, disponibilidad y checkout reales allí.
- Imitar la apariencia de la tienda dentro de RedLibertad o redirigir externamente no garantiza admisión en Merchant Center.
- Para publicar productos de varios comerciantes bajo una cuenta de plataforma se requiere evaluación de las estructuras oficiales de marketplace multivendedor (MCA). No generar un feed Merchant de RedLibertad automáticamente.

## Suscripciones posibles — no activadas
La cuota mensual podría pagar herramientas de promoción, sincronización y estadísticas, nunca obligar al vendedor a migrar su sistema de cobro. Precios, facturación, condiciones y políticas pendientes de decisión expresa.

Fuentes: https://support.google.com/merchants/answer/6324416 ; https://support.google.com/merchants/answer/4752265 ; https://support.google.com/merchants/answer/14228975 .
