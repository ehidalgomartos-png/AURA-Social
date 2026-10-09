# RedLibertad V3.2.17.1 — Originalidad editorial: error claro y borrador guardado

Hotfix sobre **V3.2.17 estable**: commit `ec1d89c8e209a0124c293b93376e9c3d161f1f27`.

- El formulario avisa exactamente si el titular o el resumen coincide con los metadatos RSS, o no cumple su longitud mínima, junto a cada campo.
- Antes de aprobar, se verifica que **titular y resumen visibles ya estén guardados** en la revisión actual; las modificaciones no guardadas nunca se aprueban accidentalmente.
- El administrador guarda de forma explícita el borrador, vuelve a visualizar la noticia y confirma fuente, hechos, derechos y aprobación por separado.
- Al guardar, se reabre la noticia si sigue pendiente y no se pierden el foco de la revisión ni las decisiones previamente registradas.
- El servidor conserva su comprobación de originalidad y devuelve campos específicos en el error 422, sin filtrar datos personales.
- Se conserva el flujo de rechazo, reapertura, control de calidad, auditoría y publicación **manual**. Sin cambios de base de datos, multimedia, usuarios ni contenido publicado.
- Pruebas de regresión añadidas al CI. El detector solo detecta igualdad normalizada con metadatos RSS; no garantiza originalidad legal ni veracidad.
