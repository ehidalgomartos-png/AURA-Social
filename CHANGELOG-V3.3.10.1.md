# V3.3.10.1 — Mobile Growth Spacing Hotfix

## Error reproducido en capturas
En el Inicio móvil, al desplegar «Completa tu RedLibertad», tras la tarjeta de invitación aparecía un hueco de unos 124 px antes de la primera publicación.

## Causa
Una regla CSS heredada en `@media(max-width:760px)` aplicaba a `#homeGrowthDetailsV3224[open]` un `margin-bottom` igual a la reserva del dock móvil (`112px + 12px + safe-area`). Ese espacio se sumaba físicamente entre el checklist y el feed. La protección real de los controles ya estaba cubierta por `scroll-margin-bottom` de los pasos y por el padding inferior de `.social-main`.

## Solución
- Igualar el margen del desplegable abierto al margen normal móvil de 10 px; sin dejar la altura del dock como hueco visible.
- Mantener padding y scroll-margin para enfocar botones sobre la navegación inferior.
- Cambiar la URL de la hoja de estilos para evitar cachés de CSS obsoleto tras el despliegue.
- Comprobar que la tarjeta de invitación sigue dentro de un único desplegable, inmediatamente antes del feed.

Sin cambios en backend, datos, privacidad, conteos, publicaciones o monetización. Validar GitHub Actions y PostgreSQL 18 antes y después de la fusión; despliegue en Coolify independiente.
