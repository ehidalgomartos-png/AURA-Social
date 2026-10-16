# RedLibertad — Plan Marketplace Profesional (propuesta, octubre de 2026)

**Estado:** Diseño funcional, **SIN cobros reales** y **SIN activación de Merchant Center** en V3.2.75. La red social y el Marketplace gratuito siguen tal como están. Cualquier precio, contrato, proveedor y lanzamiento requiere autorización expresa.

## Visión
- **Particular gratuito:** publica anuncios; interesados contactan por chat; sin compra directa.
- **Profesional de pago mensual:** podrá activar venta directa únicamente cuando su negocio esté verificado y tenga las condiciones de venta completas.
- La cuota mensual concede funciones comerciales, **no** garantiza aprobación de Google Merchant Center.
- Sin publicidad automática, comisiones ocultas, publicaciones automáticas ni desplazamiento de los particulares.

## Fase V3.2.76 — Centro vendedor (sin cobrar)
1. Estado de vendedor: borrador, pendiente de revisión, verificado, suspendido.
2. Datos legales/comerciales con acceso restringido: identificación de empresa/autónomo, contacto, IVA, dirección fiscal y política de privacidad (evaluación jurídica RGPD).
3. Reglas por vendedor: envíos y zonas de cobertura, gastos, plazos, devolución y reembolsos; vendedor responsable claramente identificado.
4. Inventario editable, condición nuevo/usado, GTIN/MPN cuando proceda, fotos, disponibilidad y precio.
5. Panel de preparación Merchant en modo AUDITORÍA, sin feed público.

## Fase V3.2.77 — Suscripción + checkout, modo pruebas
1. Comparar Stripe Billing (cuotas) + Stripe Connect (identificación/KYC y pagos a vendedores), elegir quién es merchant of record, régimen de impuestos y responsables de disputas. Validación jurídica y económica antes de contratar.
2. Seller onboarding con cuentas conectadas, webhooks autenticados, idempotentes y auditados.
3. Suscripción vinculada a capacidad de venta directa, con renovación, fallo, reintento, suspensión, cancelación y recuperación; los anuncios gratuitos no deben borrarse por cancelación.
4. Checkout HTTPS y compatible con móvil para compradores particulares, idealmente sin registro forzoso, siempre con precio final y costes transparentes.
5. Pedidos con estados fiables, reserva/ajuste de stock, fraude y prueba de compra; sin almacenar tarjetas en RedLibertad.
6. Pruebas integrales de pagos, devolución, disputa/contracargo, doble webhook, pago duplicado y caída parcial.
7. **Sin cobros reales** hasta aprobar términos, políticas, textos legales, comisiones, retenciones y pruebas.

## Fase V3.2.78 — Merchant Center condicionado
1. Investigar y solicitar una estructura de **Marketplace Multi-Client Account (MCA)** con cuentas por vendedor o configuración multivendedor adecuada. No tratar a vendedores distintos como un único comercio.
2. Solo feed de productos comercializables: venta, anuncio público y activo, vendedor habilitado y verificable, stock, precio y disponibilidad sincronizados, checkout funcional y envío elegible.
3. Información exigida en fichas y checkout: identidad del vendedor, atención al cliente, plazos/costes de envío, devoluciones/reembolsos, métodos de pago y políticas claras.
4. GTIN/MPN/marca/condición coherentes; datos estructurados y URL canónica con fotografía existente en VPS. No inventar identificadores ni valoraciones.
5. Descartar del feed anuncios «Busco comprar», servicios, inmuebles y anuncios con condiciones incompletas.
6. Diagnóstico y rechazo por anuncio, sin afirmar «aprobado» hasta resolución real de Google.

## Decisiones pendientes del propietario
- Cuota mensual y periodo de prueba (ningún precio fijado).
- ¿Quién responde legalmente al comprador? ¿Vendedor autónomo, empresa o plataforma? Validación con asesoría.
- ¿La plataforma cobra comisión por pedido además de la cuota?
- Un pedido por vendedor inicialmente o carrito multivendedor.
- Países y monedas iniciales; impuestos, facturas, logística y atención al cliente.
- Requisitos de Merchant para terceros y configuración con Google aprobada.

## Fuentes de requisitos (consultadas octubre de 2026)
- Google Merchant Center: https://support.google.com/merchants/answer/14228975 (estructuras de cuentas para marketplaces).
- Google Merchant Center: https://support.google.com/merchants/answer/9158778 (checkout y coherencia de producto).
- Google Merchant Center: https://support.google.com/merchants/answer/15108683 (cuentas multivendedor).
- Stripe Connect: https://docs.stripe.com/connect
- Stripe Billing: https://docs.stripe.com/billing

**No implementar en V3.2.75 ninguna suscripción, feed Merchant o venta directa.**
