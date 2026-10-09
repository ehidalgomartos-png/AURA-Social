# RedLibertad V3.2.20 — Noticias sin fuente RSS y conservación de trazabilidad

**Base estable**: V3.2.19, merge `c8b0eb955d3e64b8d9c1f7a2066051179035ce1f`.

## Motivo
Eliminar una fuente RSS conservaba las noticias, pero al desaparecer la relación con
`editorial_sources`, los candidatos podían perder el nombre original del medio en
el Centro Editorial. Las noticias huérfanas también podían quedar mezcladas con
los últimos 100 registros sin una forma de localizarlas todas por estado.

## Solución
- Dos columnas opcionales en `editorial_candidates` mediante migración aditiva, segura:
  `source_name_snapshot VARCHAR(100)` y `removed_source_id BIGINT`.
- Antes de la eliminación explícita de una fuente se preserva en sus noticias
  el nombre del medio y el identificador de fuente anterior, en la **misma transacción**.
  No se reescriben titulares, resúmenes, decisiones ni publicaciones.
- El endpoint administrativo de revisiones acepta `orphaned=only`, filtrado **en SQL**
  antes de su `LIMIT 100`; funciona para pendientes, aprobadas y rechazadas.
- El panel añade **Fuente RSS → Solo sin fuente**, muestra un aviso junto a cada
  noticia y avisa antes de abandonar un borrador no guardado.
- La cola de publicación usa el nombre de fuente preservado y advierte explícitamente
  cuando falta la fuente; las reglas ya existentes siguen bloqueando publicación sin
  fuente RSS autorizada y revisión humana.
- Las noticias ya huérfanas por eliminaciones anteriores siguen siendo localizables,
  pero no se inventa su nombre original cuando no existe un registro verificable.
- Las publicaciones históricas siguen siendo visibles si ya estaban publicadas.
  No hay descarte o eliminación automáticos de noticias.

## Seguridad
Sin cron, publicaciones automáticas, IA de pago, cuentas falsas ni alteración
de multimedia. El filtro es exclusivamente para administradores. La eliminación
futura de una fuente sigue exigiendo vista previa, confirmación con nombre,
comprobación de contadores, transacción y auditoría.

## Verificación
Desplegar desde GitHub/Coolify, comprobar /api/health versión 3.2.20 y probar
Centro Editorial → Revisión de noticias → Fuente RSS «Solo sin fuente» en cada
estado. Verificar nombre conservado al eliminar manualmente una fuente de prueba.
