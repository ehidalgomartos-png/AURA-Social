# RedLibertad Resuelve — V3.5.19: administración separada

## Acceso
La URL de administración es **/resuelve/admin**, con la misma cuenta de RedLibertad. La ruta HTML se comprueba en el servidor mediante `requireAdmin`, y el archivo HTML privado vive fuera de la carpeta `public`. La cabecera envía `Cache-Control: no-store` y `X-Robots-Tag: noindex,nofollow,noarchive`.

- Desde `/resuelve`, solo con cuenta administradora aparece el enlace **Administración** en la cabecera.
- Desde el panel general `/admin` hay un enlace directo al Centro de administración de Resuelve.
- Un usuario normal o un visitante que intente entrar directamente recibirá 403 o 401 y no obtendrá el HTML privado.

## Apartados
1. **Estadísticas**: ocho indicadores agregados obtenidos del servidor, actualización manual y explicación para no confundir recibir una respuesta con solucionar un problema.
2. **Soluciones pendientes**: muestra respuestas elegidas por usuarios que cumplen los mínimos; se ofrece apertura de la petición original para revisar el contexto, tres casillas de comprobación obligatorias y confirmación antes de aprobar.
3. **Avisos y denuncias**: presenta avisos pendientes, opción de abrir el contenido original, desestimar un aviso o, tras confirmación, ocultar manualmente la respuesta. Una denuncia no produce una sanción automática.

Los tres apartados cuentan con recarga independiente y paginación en las colas existentes. Las respuestas se renderizan mediante `textContent`, sin insertar HTML de usuarios. Se reutilizan los endpoints con validación de permisos, origen y límites de frecuencia de versiones anteriores.

## Cambio de portada
Los paneles de administración ya **no** aparecen mezclados con peticiones y soluciones en la portada pública de Resuelve. Solo se muestra el enlace al centro, si la cuenta dispone de permisos. Las funciones públicas, el registro compartido, el reparto voluntario de ayuda y los enlaces para enviar preguntas siguen igual.

## Verificaciones
- Comprobar con una cuenta administradora: `/resuelve/admin` carga métricas, soluciones y avisos.
- Comprobar en ventana privada y con usuario común: acceso 401/403 sin HTML privado.
- Verificar que la portada pública muestra únicamente el enlace administrativo para administradores.
- Probar que los avisos no ocultan contenido automáticamente, la aprobación requiere revisión y las acciones se reflejan tras actualizar.
- Verificar despliegue de commit de `main` en Coolify; la fusión en GitHub por sí sola no confirma producción.
