# RedLibertad V1.17.0 — Creator VIP Circle

Base estable: RedLibertad V1.16.0 — Fans & Creator Engagement.

## Círculo VIP
- Nuevo círculo privado para creadores verificados.
- Límite de 50 miembros VIP por creador.
- Solo pueden añadirse seguidores actuales.
- El límite se valida dentro de una transacción.
- Añadir y quitar VIP desde Tu audiencia y Fans más activos.
- Lista privada de miembros VIP dentro del Centro de creador.
- El estado VIP no es público.

## Seguimiento de relación
- Cada miembro VIP conserva la fecha en la que fue añadido.
- Si deja de seguir al creador, queda marcado como inactivo en el Centro de creador.
- Un VIP inactivo no recibe avisos VIP.
- El creador puede retirarlo manualmente del círculo.

## Avisos VIP
- Avisos internos de hasta 280 caracteres.
- Máximo un aviso VIP cada 24 horas.
- Cooldown protegido dentro de una transacción.
- Solo se envían a miembros VIP que siguen actualmente al creador.
- Se excluyen usuarios silenciados o relaciones bloqueadas.
- Historial de los últimos 10 avisos VIP.
- Se registra el número de destinatarios de cada aviso.

## Notificaciones
- Nuevo tipo creator_vip_broadcast.
- Icono específico VIP.
- Los avisos VIP aparecen en Todo y Comunidad.
- Tocar un aviso VIP abre el perfil del creador.

## Base de datos
- Nueva tabla creator_vips.
- Nueva tabla creator_vip_broadcasts.
- Índices por creador y fecha.
- Actualización idempotente de notifications_type_check.
- db/schema.sql actualizado para instalaciones nuevas.

## Compatibilidad
- Conserva íntegramente V1.12 a V1.16.
- No introduce pagos ni cambia la visibilidad de publicaciones existentes.
- /api/health actualizado a 1.17.0.
- Caché PWA actualizada a V1.17.
