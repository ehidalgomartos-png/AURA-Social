# RedLibertad V1.10.0 — Account & Security

Base estable: RedLibertad V1.9.0.

## Centro de cuenta
- Nuevo botón Cuenta en el perfil propio.
- Resumen de email, antigüedad, publicaciones, comentarios, seguidores y seguidos.
- Fecha del último cambio de contraseña cuando existe.

## Seguridad de sesión
- Nueva columna users.auth_token_version.
- Los JWT incluyen authVersion.
- requireAuth y optionalAuth validan el token contra el estado real de la cuenta.
- Cuentas suspendidas o eliminadas dejan de autenticarse inmediatamente.
- Tokens anteriores a V1.10 siguen siendo compatibles mientras la versión sea 0.

## Contraseña
- Cambio de contraseña con contraseña actual.
- Longitud mínima: 10 caracteres.
- Impide reutilizar la misma contraseña.
- Al cambiarla se incrementa auth_token_version.
- La sesión actual recibe un JWT nuevo; el resto queda invalidado.

## Cerrar sesiones
- Botón para cerrar todas las sesiones.
- Incrementa auth_token_version y elimina la cookie actual.
- Requiere volver a iniciar sesión.

## Exportación de datos
- Descarga JSON desde Cuenta.
- Incluye datos de perfil, intereses, posts, comentarios, seguidores/siguiendo, bloqueos, silenciados, mensajes e invitaciones.
- Nunca incluye password_hash ni secretos de autenticación.

## Eliminación de cuenta
- Requiere contraseña actual.
- Requiere escribir exactamente el @usuario.
- Las cuentas administradoras no se pueden borrar desde la app.
- Elimina la cuenta mediante las relaciones ON DELETE existentes.
- Elimina conversaciones que quedan sin dos miembros.
- Intenta eliminar del almacenamiento local avatar, portada y multimedia propia.

## Base de datos
- users.auth_token_version INTEGER NOT NULL DEFAULT 0.
- users.password_changed_at TIMESTAMPTZ.
- Bootstrap idempotente para bases existentes.
- db/schema.sql actualizado para instalaciones nuevas.

## Compatibilidad
- /api/health actualizado a 1.10.0.
- Cache PWA actualizado a V1.10.
