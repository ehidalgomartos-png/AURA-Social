# RedLibertad V1.11.0 — Trust & Moderation 2.0

Base estable: RedLibertad V1.10.0.

## Panel de administración
- Rediseño completo del panel de moderación.
- Métricas ampliadas.
- Filtros de denuncias: abiertas, todas, críticas y resueltas.
- Usuarios con estado, bio, actividad, denuncias y número de acciones de moderación.
- Diseño responsive para móvil y escritorio.

## Denuncias
- Cada denuncia muestra el autor real del contenido cuando es posible.
- Vista previa de publicaciones, comentarios, mensajes o perfil denunciado.
- Acción directa para moderar al usuario asociado.
- Mantiene resolver, ocultar publicación y descartar.

## Moderación de cuentas
- Avisar usuario.
- Suspender 24 horas.
- Suspender 7 días.
- Suspender 30 días.
- Suspender indefinidamente.
- Reactivar cuenta.
- Bloquear cuenta.
- Motivo obligatorio en suspensiones y bloqueos desde la interfaz.
- Protección de cuentas administradoras.

## Historial
- Nueva tabla user_moderation_actions.
- Registra administrador, acción, motivo, duración, fecha y expiración.
- Verificaciones +18 y creador también quedan auditadas.
- Historial consultable desde cada ficha de usuario.

## Suspensiones
- Nuevos campos users.suspended_until y users.suspension_reason.
- Las suspensiones temporales expiran automáticamente.
- Al suspender o bloquear se incrementa auth_token_version y se invalidan las sesiones existentes.
- El login muestra estado suspendido y fecha de finalización.
- Las cuentas reactivadas deben iniciar una sesión válida de nuevo.

## Base de datos
- Bootstrap idempotente para instalaciones existentes.
- db/schema.sql actualizado para instalaciones nuevas.
- No requiere SQL manual.

## Compatibilidad
- /api/health actualizado a 1.11.0.
- Cache PWA actualizado a V1.11.
