# RedLibertad V3.2.19 — Eliminación segura de fuentes RSS autorizadas

Base estable: V3.2.18.1 — `c9f055694c7bcaaee3264ce1a9e3fe1ff21efc2d`.

## Función
- Botón «Eliminar» junto a todas las fuentes RSS, incluidas las ya aprobadas/autorizadas.
- Vista previa: nombre, estado, número de noticias importadas (pendientes/aprobadas/rechazadas) y publicaciones derivadas, incluidas las todavía visibles.
- Requiere escribir el nombre exacto del medio y confirmar explícitamente la operación antes de borrar.
- El servidor vuelve a contar candidatos/publicaciones en una transacción con bloqueo; si la información cambió, **no elimina** y exige revisar la vista previa.
- Elimina solo la fuente RSS. Por FK `editorial_candidates.source_id ON DELETE SET NULL` permanecen los candidatos existentes. Las publicaciones, títulos, resúmenes, atribuciones independientes y archivos persisten.
- Las noticias importadas de esa fuente que aún no estuvieran publicadas no podrán publicarse usando una fuente ya eliminada. Las publicaciones existentes permanecen visibles hasta que se retiren manualmente.
- La fuente borrada deja de poder consultarse y deja de aparecer en la configuración editorial. La eliminación queda registrada en `editorial_audit` sin exponer permisos ni datos sensibles.
- Sin cambios de base de datos, trabajos programados, cobros ni IA. Sin publicación o eliminación masiva de contenidos.
- Diseño responsive/mobile-first. Pruebas con transacción correcta, cancelación por contadores obsoletos y fallo de auditoría.

## Operación
Tras el merge y despliegue en Coolify, comprobar `/api/health` con versión `3.2.19`, abrir Centro Editorial → Fuente RSS autorizada → Eliminar y revisar atentamente los contadores. No confirmar si se pretende retirar noticias públicas: esas publicaciones deben retirarse por separado.
