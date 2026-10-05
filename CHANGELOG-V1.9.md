# RedLibertad V1.9.0 — Privacy & Control

Base estable: RedLibertad V1.8.0.

## Centro de privacidad
- Nuevo botón Privacidad en el perfil propio.
- Ajustes agrupados en un modal específico.
- Listas gestionables de usuarios silenciados y bloqueados.

## Mensajes
- Tres niveles para nuevas conversaciones:
  - Todo el mundo.
  - Solo personas que sigues.
  - Nadie.
- Las conversaciones existentes no se cierran al cambiar la preferencia.
- Mensajes de error claros cuando la otra persona restringe nuevas conversaciones.

## Descubrimiento
- Toggle para aparecer o no en Explorar y sugerencias.
- Las cuentas no descubribles siguen siendo accesibles mediante @usuario o enlace directo.
- Toggle para aparecer o no como persona con actividad reciente.

## Silenciar
- Silenciar / dejar de silenciar desde un perfil.
- Oculta publicaciones del feed, búsqueda, tendencias y guardados.
- Oculta Stories.
- Oculta sugerencias de persona.
- Oculta notificaciones generadas por la cuenta silenciada.
- No impide visitar manualmente su perfil ni conversar si ambos lo permiten.

## Bloquear
- Bloquear / desbloquear desde perfiles.
- Gestión desde la lista de Bloqueados.
- Al bloquear se eliminan las relaciones de seguimiento en ambos sentidos.

## Base de datos
- Nuevos campos users.message_privacy, users.discoverable y users.show_activity.
- Nueva tabla mutes.
- Bootstrap idempotente para instalaciones existentes.
- db/schema.sql actualizado para instalaciones nuevas.
- No hace falta ejecutar SQL manualmente.

## Compatibilidad
- /api/health actualizado a 1.9.0.
- Cache PWA actualizado a V1.9.
