# RedLibertad V1.14.0 — Creator Profile & Links

Base estable: RedLibertad V1.13.0 — Creator Hub & Featured Content.

## Perfil de creador
- Nuevo titular público de creador de hasta 120 caracteres.
- Disponible únicamente para cuentas con creator_verified=true.
- El titular aparece en el propio perfil y en la presentación pública del creador.

## Enlaces públicos
- Hasta 5 enlaces por creador.
- Cada enlace incluye texto y URL.
- Solo se admiten URLs http:// o https://.
- Gestión integrada dentro del Centro de creador.
- Los enlaces se muestran como CTAs en el perfil público.
- Los enlaces pueden editarse o eliminarse manteniendo sus contadores cuando se conserva el mismo registro.

## Métricas y privacidad
- Contador agregado de clics por enlace.
- Métrica de clics totales en el Centro de creador.
- No se guarda quién hizo clic.
- No se almacenan IP, dispositivo, user-agent ni historial individual de clics.

## Base de datos
- Nueva columna users.creator_headline.
- Nueva tabla creator_links.
- Orden configurable mediante position.
- click_count se almacena como contador agregado.
- ON DELETE CASCADE elimina los enlaces al borrar la cuenta.
- Bootstrap idempotente en la API de perfiles.
- db/schema.sql actualizado para instalaciones nuevas.
- No requiere SQL manual.

## Compatibilidad
- Conserva V1.12 Verification & Trust y V1.13 Creator Hub.
- /api/health actualizado a 1.14.0.
- Nuevas features: creator-profile-v1.14, creator-public-links y aggregate-link-clicks.
- Caché PWA actualizada a V1.14.
