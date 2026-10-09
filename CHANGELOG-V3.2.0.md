# RedLibertad V3.2.0 — Editorial Foundation

Base estable: V3.1.0 / PR #158 / commit 645709122465f3cc731d6d96749d6ed1fed23d0e.

## Qué incluye

- Centro Editorial en Administración para crear/editar **perfiles editoriales de configuración**, sin cuentas de usuario reales ni actividad simulada.
- Fuentes RSS HTTPS administrables con categoría, permiso de uso confirmado, documentación de licencias y estado.
- Asociación opcional de perfil editorial a una comunidad pública propia o administrada; no se modifica la comunidad.
- Esquema PostgreSQL aditivo, auditoría administrativa y valores globales seguros.
- Validaciones de entrada, permisos y controles que impiden activar ingesta y auto-publicación.
- V3.2.0 solo configura; **no consulta RSS, no genera borradores ni publica**, ni crea usuarios editoriales visibles todavía.

## Validación manual

1. GitHub Actions en verde, prueba de sintaxis y tests: npm test.
2. Abrir /admin como administrador y confirmar Centro Editorial.
3. Crear un perfil en borrador, editarlo, asociarlo a comunidad pública propia/administrada; comprobar rechazo de comunidad privada/no administrada.
4. Crear una fuente HTTPS en borrador. Intentar URL HTTP, localhost, IP, URL con credenciales y foto externa: deben rechazarse.
5. Aprobación de fuente requiere marcar la confirmación de condiciones; una licencia documentada requiere referencia.
6. Recargar: revisar los registros, edición y auditoría. Verificar que no se publican posts ni se lanzan consultas RSS.
7. Verificar /api/health con version 3.2.0 tras despliegue y probar perfiles, media persistente y comunidades existentes.

## Próxima fase

V3.2.1: lector RSS con políticas SSRF/dns/redirect y restricciones de tamaño/tiempo, deduplicación y borradores sin publicación. Antes de habilitar imágenes externas deberán resolverse licencias, permisos y revalidación de URL.

## Precauciones

No ejecutar db:init para realizar esta actualización en producción; los esquemas incrementales se crean por la ruta administrativa. Mantener copia manual de PostgreSQL y volumen multimedia antes del despliegue. No se altera Coolify, PostgreSQL existente, medios locales ni monetización.
