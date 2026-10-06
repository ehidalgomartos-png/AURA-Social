# RedLibertad V1.15.0 — Creator Audience & Broadcasts

Base estable: RedLibertad V1.14.0 — Creator Profile & Links.

## Audiencia
- Nueva sección Tu audiencia dentro del Centro de creador.
- Muestra hasta 20 seguidores recientes.
- Cada persona enlaza a su perfil.
- Reutiliza la relación follows existente; no crea una segunda relación de fan o suscripción.

## Avisos a seguidores
- Los creadores verificados pueden enviar avisos internos de texto.
- Longitud máxima: 280 caracteres.
- Frecuencia máxima: un aviso cada 24 horas.
- El cooldown se valida en una transacción con bloqueo de la cuenta para impedir envíos simultáneos.
- Los avisos se entregan mediante notificaciones internas.
- Se excluyen seguidores que hayan silenciado al creador.
- Se excluyen relaciones bloqueadas.
- Se registra el número de destinatarios de cada aviso.

## Historial y métricas
- Historial de los últimos 10 avisos.
- Cada aviso muestra fecha relativa y número de destinatarios.
- Métrica total de avisos enviados.
- El Centro de creador informa de cuándo estará disponible el siguiente aviso.

## Notificaciones
- Nuevo tipo creator_broadcast.
- Los avisos aparecen en Todo y Comunidad.
- Icono específico de aviso.
- Tocar una notificación de aviso abre el perfil del creador.

## Base de datos
- Nueva tabla creator_broadcasts.
- Índice por creador y fecha.
- Actualización idempotente de notifications_type_check para incluir creator_broadcast.
- db/schema.sql actualizado para instalaciones nuevas.
- No requiere SQL manual.

## Compatibilidad y privacidad
- Conserva V1.12 Verification & Trust, V1.13 Creator Hub y V1.14 Creator Profile & Links.
- No se crean conversaciones privadas ni mensajes masivos.
- Los avisos respetan silencios y bloqueos.
- /api/health actualizado a 1.15.0.
- Caché PWA actualizada a V1.15.
