# RedLibertad V1.19.0 — VIP Stories & Exclusive Feed

Base estable: RedLibertad V1.18.0 — Exclusive Creator Content.

## Stories VIP
- Nuevo campo stories.audience con valores public y vip.
- Selector Público / Solo VIP al publicar una Story.
- Solo creadores verificados pueden publicar Stories VIP.
- Una Story VIP es visible para:
  - su autor,
  - administradores,
  - miembros del Círculo VIP que siguen actualmente al creador.
- Las Stories VIP siguen respetando las reglas de +18 y contenido sensible.
- Bloqueos y silencios se aplican antes de devolver Stories.

## Visor de Stories
- Nuevo visor dentro de RedLibertad.
- Las Stories dejan de ser únicamente indicadores visuales y pueden abrirse.
- Navegación anterior/siguiente entre las Stories visibles del mismo creador.
- Badge “★ SOLO VIP” dentro del visor.
- Aro y estrella VIP en la bandeja de Stories cuando el creador tiene contenido exclusivo visible.

## Feed exclusivo
- Nueva pestaña VIP en Inicio.
- Nuevo modo /api/posts/feed?mode=vip.
- Devuelve únicamente posts con audience=vip autorizados para la cuenta actual.
- Respeta bloqueos y silencios existentes.
- Mantiene todos los controles de contenido de V1.18.

## Señal de contenido nuevo
- Badge en la pestaña VIP.
- Cuenta publicaciones VIP y Stories VIP creadas después de la última visita VIP.
- Excluye el contenido VIP propio del usuario del contador de novedades.
- El indicador se limpia al abrir el feed VIP o una Story VIP.
- La señal se guarda localmente en el dispositivo; no crea tracking adicional en servidor.

## Creator Hub
- Nueva métrica Stories VIP activas.
- El contador solo considera Stories VIP publicadas y no caducadas.

## Base de datos y despliegue
- Nueva columna stories.audience.
- Constraint stories_audience_check.
- Índice idx_stories_audience_active.
- Bootstrap idempotente en el router de Stories.
- El bootstrap del Creator Hub asegura también el esquema de Stories VIP.
- Corregido el delimitador DO de posts_audience_check heredado de V1.18 en db/schema.sql.
- /api/health actualizado a 1.19.0.
- Caché PWA actualizada a V1.19.

## Monetización
V1.19 mantiene el sistema VIP completamente gratuito.
No se añaden:
- precios,
- planes,
- suscripciones,
- pagos,
- checkout,
- créditos,
- saldos,
- reparto de ingresos,
- paywalls comerciales.

El modelo public/vip queda preparado para una eventual monetización futura, pero no existe ninguna lógica comercial activa.
