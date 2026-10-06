# RedLibertad V1.13.0 — Creator Hub & Featured Content

Base estable: RedLibertad V1.12.0 — Verification & Trust.

## Centro de creador
- Nuevo botón Centro de creador en el perfil propio.
- Disponible únicamente cuando creator_verified=true.
- Resumen de seguidores, publicaciones, Reels, Me gusta, comentarios, republicaciones y guardados.
- Seguidores e interacciones muestran además la actividad generada durante los últimos 30 días.
- El centro lista hasta 24 publicaciones propias recientes para gestionar contenido destacado.

## Publicaciones destacadas
- Cada creador verificado puede destacar hasta 3 publicaciones propias publicadas.
- El límite se valida dentro de una transacción para evitar superar 3 destacados en acciones concurrentes.
- Se puede retirar un destacado en cualquier momento.
- Las publicaciones destacadas aparecen antes que el resto en el perfil.
- El grid del perfil muestra el badge “★ DESTACADO”.
- Borrar una publicación elimina automáticamente su relación de destacado mediante ON DELETE CASCADE.

## Base de datos
- Nueva tabla creator_featured_posts.
- Clave primaria user_id + post_id.
- Índice por usuario y fecha de destacado.
- Bootstrap idempotente tanto desde perfiles como desde la carga de contenido del perfil.
- db/schema.sql actualizado para instalaciones nuevas.
- No requiere ejecutar SQL manualmente.

## Interfaz
- Centro de creador responsive y mobile-first.
- Métricas adaptadas a móvil en dos columnas.
- Gestión de destacados desde una lista compacta con previsualización.
- El Centro de creador no se muestra a cuentas no verificadas.

## Compatibilidad
- Conserva íntegramente V1.12 Verification & Trust.
- /api/health actualizado a 1.13.0.
- Nuevas features: creator-hub-v1.13, creator-analytics y featured-profile-posts.
- Caché PWA actualizada a V1.13.
