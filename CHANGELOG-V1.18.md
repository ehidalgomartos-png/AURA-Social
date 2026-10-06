# RedLibertad V1.18.0 — Exclusive Creator Content

Base estable: RedLibertad V1.17.0 — Creator VIP Circle.

## Publicaciones Solo VIP
- Nuevo campo posts.audience con valores public y vip.
- Selector de audiencia dentro del compositor.
- Solo las cuentas creator_verified pueden publicar con audience=vip.
- La audiencia queda fijada al crear la publicación en V1.18.
- Los controles de contenido normal/sensible/desnudez siguen aplicándose de forma independiente.

## Control de acceso
Una publicación VIP puede verla:
- su autor,
- un administrador,
- un miembro de creator_vips que además siga actualmente al creador,
- un participante aprobado para conservar acceso a su contenido y consentimiento.

El acceso se aplica en:
- Feed.
- Following / Para ti / Últimas.
- Momentum.
- Explorar.
- Búsqueda.
- Trending.
- Hashtags y tendencias.
- Guardados.
- Perfil del creador.
- Detalle de publicación.
- Likes, comentarios y guardados.

## Protección frente a fugas
- Los posts VIP no se pueden republicar.
- No muestran acción de compartir.
- La página pública /p/:id solo carga posts con audience=public.
- Los enlaces profundos a un post VIP responden como no disponibles si el usuario no tiene acceso.
- Las menciones dentro de contenido VIP solo generan notificación para miembros autorizados o participantes.
- El contador público de publicaciones de un perfil cuenta únicamente las publicaciones visibles para ese visitante.

## Privacidad del usuario
- Si una persona pierde acceso VIP, deja de ver inmediatamente el contenido exclusivo.
- Puede seguir retirando su propio Me gusta o guardado sin recuperar acceso ni recibir datos de la publicación.
- Los comentarios propios siguen pudiendo eliminarse mediante el control de propiedad existente.

## Interfaz
- Badge “★ SOLO VIP” en publicaciones exclusivas.
- Badge VIP en grids de perfil.
- Distintivo en Momentum y analítica del Centro de creador.
- Contador de contenido VIP en Creator Hub.
- La opción Solo VIP queda desactivada para cuentas que no son creador verificado.

## Base de datos y despliegue
- Nueva columna posts.audience.
- Constraint posts_audience_check.
- Índice idx_posts_audience_created.
- Bootstrap idempotente desde /api/posts y /api/profiles.
- La ruta pública de posts asegura también la existencia de la columna antes de consultar.
- Se corrige el bootstrap social heredado para no degradar los tipos de notificación creator_broadcast y creator_vip_broadcast.
- /api/health actualizado a 1.18.0.
- Caché PWA actualizada a V1.18.
