# RedLibertad V1.8.0 — Growth & Invites

Base estable: RedLibertad V1.7.0.

## Onboarding
- Panel de primeros pasos en Inicio.
- 5 hitos: foto de perfil, bio/intereses, seguir 3 personas, primera publicación e interacción.
- Progreso visual dinámico.
- Los pasos incompletos llevan directamente a la zona correspondiente.
- El panel se actualiza al editar perfil, seguir, publicar, dar Me gusta, comentar o republicar.

## Invitaciones
- Cada usuario dispone de un enlace personal:
  /?ref=usuario#registro
- Compartir mediante Web Share.
- Botón específico de WhatsApp.
- Copia de enlace con fallback compatible con HTTP.
- La landing muestra el perfil de la persona que invita.

## Atribución
- El registro acepta referralUsername de forma opcional.
- La atribución se guarda una sola vez por nueva cuenta.
- El invitador recibe una notificación de sistema enlazada al nuevo perfil.
- Referencias inválidas no bloquean el registro.

## Métricas
- Número total de usuarios invitados.
- Número de invitados activados.
- Se considera activado cuando realiza al menos una acción social relevante.

## Base de datos
- Nueva tabla referrals con relación invitador -> usuario invitado.
- Creación idempotente tanto desde Auth como desde Growth API.
- db/schema.sql actualizado para instalaciones nuevas.
- No hace falta ejecutar SQL manualmente.

## Compatibilidad
- /api/health actualizado a 1.8.0.
- Cache PWA actualizado a V1.8.
