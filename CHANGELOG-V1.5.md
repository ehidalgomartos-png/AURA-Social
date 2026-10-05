# RedLibertad V1.5.0 — Community & Viral

Base estable: RedLibertad V1.4.3.

## Menciones
- @usuario es clicable en publicaciones y comentarios.
- Al mencionar a una persona se crea una notificación.
- Las menciones respetan bloqueos y cuentas activas.

## Republicaciones
- Botón Republicar con estado persistente.
- Quitar republicación volviendo a pulsar.
- Contador de republicaciones por post.
- El autor recibe una notificación.
- En el feed Siguiendo, las republicaciones de personas seguidas pueden recuperar una publicación.
- Se muestra quién la republicó en ese contexto.

## Comunidad
- Listas de Seguidores y Siguiendo en perfiles propios y públicos.
- Desde esas listas se puede abrir el perfil y seguir/dejar de seguir.
- Diseño adaptado a móvil.

## Compartir dentro de RedLibertad
- El modal Compartir permite introducir @usuario.
- Se crea o reutiliza una conversación privada.
- Se envía el enlace de la publicación dentro de Mensajes.

## Base de datos
- Nueva tabla reposts.
- Nuevos tipos de notificación mention y repost.
- Bootstrap idempotente en runtime; no hace falta ejecutar una migración manual.
- db/schema.sql actualizado para instalaciones nuevas.

## Compatibilidad
- /api/health actualizado a 1.5.0.
- Cache PWA actualizado a V1.5.
