# RedLibertad V3.2.16 — Revisión editorial ágil y diversidad

Base: V3.2.15 estable (commit `816de24af097be7cc143bd1d298ca49abed780ad`).

- Borradores provisionales más concretos: titular reformulado con atribución, extracto RSS citado parcialmente (máximo 18 palabras), límites editoriales explícitos y aviso cuando faltan datos. No inventa hechos y no consulta artículos completos.
- Detección de solapamiento temático entre noticias de una o varias fuentes durante 7 días. Prioridad suave a temas distintos, categorías y medios variados: ninguna noticia se borra ni se rechaza automáticamente.
- Información de cobertura RSS por categoría para recomendar la incorporación **manual** de fuentes aprobadas; sin añadir feeds nuevos ni modificar permisos o condiciones de uso.
- Revisión móvil: navegación Anterior / Siguiente, posición en cola y aviso de cambios sin guardar.
- Datos y derechos existentes intactos, sin migración de PostgreSQL ni cambios en medios o usuarios. Sin nuevos servicios de pago.
- Mantiene verificación factual, edición, aprobación, control de calidad y publicación **manuales**.
- Pruebas de regresión de recomendaciones, diversidad y navegación, integradas en GitHub Actions.
