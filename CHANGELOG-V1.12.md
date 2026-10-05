# RedLibertad V1.12.0 — Verification & Trust

Base estable: RedLibertad V1.11.0.

## Centro de confianza
- Nuevo botón Confianza en el perfil propio.
- Estado visual de mayoría de edad y creador.
- Historial de solicitudes de verificación.
- Cancelación de solicitudes pendientes.

## Solicitudes
- Tipos disponibles: +18 y creador.
- Nota opcional de contexto.
- Nunca se pide subir DNI, pasaporte u otros documentos sensibles dentro del formulario.
- Solo puede existir una solicitud pendiente por usuario y tipo.
- No se puede solicitar una verificación que ya está aprobada.

## Administración
- Nueva cola Solicitudes de verificación.
- Filtros: pendientes, todas, aprobadas, no aprobadas y canceladas.
- Contexto del usuario, email, nota y estado actual.
- Aprobar o no aprobar con nota administrativa.
- Métrica de verificaciones pendientes en el dashboard.

## Efectos de la aprobación
- +18: activa age_verified.
- Creador: activa creator_verified y age_verified.
- Registra el resultado en las tablas heredadas age_verifications / creator_verifications.
- Genera notificación de sistema.
- Registra la acción en user_moderation_actions.

## Perfiles
- Los perfiles públicos muestran badges +18 verificado y Creador verificado cuando corresponde.
- Las verificaciones directas desde Usuarios también resuelven solicitudes pendientes.

## Base de datos
- Nueva tabla verification_requests.
- Índice único parcial para una sola solicitud pendiente por usuario/tipo.
- Bootstrap idempotente en API de confianza y administración.
- db/schema.sql actualizado para instalaciones nuevas.
- No requiere SQL manual.

## Compatibilidad
- /api/health actualizado a 1.12.0.
- Cache PWA actualizado a V1.12.
