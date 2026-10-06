# RedLibertad V1.45.0 — PWA & Performance 2.0

Base: V1.44.0 — Connections 2.0.

## PWA
- Caché separada de shell y estáticos.
- Navegación network-first con fallback offline.
- Estáticos same-origin con stale-while-revalidate.
- APIs, uploads, páginas /p/ y externos excluidos del caché.
- Limpieza automática de cachés antiguas.
- updateViaCache:none y actualización al volver al primer plano.

## Rendimiento
- content-visibility en feeds largos cuando está soportado.
- loading=lazy + decoding=async en imágenes de contenido.
- decoding=async en avatares.
- preload del logo crítico.
- creator-ops y favicon incluidos en el shell offline.

## Privacidad
- No se cachean mensajes privados ni multimedia subida por usuarios.

## Monetización
Sin pagos, suscripciones, precios, checkout, créditos, saldo ni paywalls.
