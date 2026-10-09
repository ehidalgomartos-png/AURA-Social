# RedLibertad V3.2.2 — Edición y revisión editorial humana

Base: V3.2.1 fusionada en main, PR #160, commit d36d5faad20753b09dc3f799509192d99c2890b0.

## Alcance
- Administración: bandeja con filtros Pendientes / Aprobadas internamente / Rechazadas.
- Editor accesible y responsive con título y resumen propios, nota de revisión y enlace al medio original.
- Se conservan source_title, source_excerpt, canonical_url y published_at de la fuente; ninguna edición cambia los metadatos originales.
- Guardado como borrador pendiente. Aprobación humana con confirmación de lectura de fuente, hechos verificados y permisos/atribución; requiere titular y resumen propios y nota de justificación.
- Rechazo con motivo, reapertura para revisar y registro de auditoría (acción/fecha/admin).
- Bloqueo optimista mediante revision y transacción con SELECT FOR UPDATE para impedir aprobar una versión antigua o sobreescribir otro administrador.
- Aprobado significa solo **autorizado dentro de la cola editorial**. No crea posts, no crea usuarios, no copia imágenes, no publica ni programa nada.
- PostgreSQL: ALTER TABLE aditivo. Cambios reversibles por despliegue de código, sin borrado de datos.

## Validación
1. Confirmar GitHub Actions: regresiones previas y nueva suite test:editorial-review en verde.
2. En Administración, tras tener un candidato RSS pendiente, pulsar «Revisar y editar». Deben mantenerse título/extracto de origen y enlace a la fuente.
3. Guardar un titular distinto y resumen original (mínimo 70 caracteres), nota de revisión; actualizar y comprobar persistencia.
4. Intentar aprobar sin las tres confirmaciones, sin nota o sin borrador propio: debe bloquearse.
5. Aprobar con fuente aprobada y tres verificaciones; debe pasar a Aprobadas, manteniendo /p y los feeds públicos intactos.
6. Intentar editar un candidato aprobado sin reabrir: debe bloquearse. Reabrir debe permitir edición sin perder los textos originales.
7. Rechazar con motivo, consultar en Rechazadas y reabrir si es necesario.
8. Dos administradores: un segundo cambio sobre la misma revisión antigua debe devolver 409.
9. Candidato cuya fuente se pausó/borró: no puede aprobarse.
10. Comprobar en móvil y escritorio; verificar /api/health versión 3.2.2 tras desplegar en Coolify.

## Límites
La confirmación humana no detecta por sí misma noticias falsas ni garantiza licencias. Se sigue requiriendo la comprobación real de la fuente, derechos y contexto. No se consultan URLs externas al aprobar ni se crean posts.

## Próximo paso
V3.2.3 — publicación explícita, con trazabilidad y vista previa, únicamente cuando se valide y autorice por separado. Monetización sigue aparcada.
