# V3.3.5 — Aportación pública D1/D7

## Objetivo
El Centro de crecimiento incluye actividad D1/D7 (publicaciones, comentarios, seguimientos, reacciones y mensajes). Es una medida de acciones, pero no distingue las aportaciones auténticas a conversaciones visibles.

## Cambios
- Se calculan dos nuevos indicadores de **aportación pública D1 y D7**, usando solo un post ordinario público normal publicado o un comentario hecho en un post público normal ajeno que siga disponible.
- Ventanas: D1, entre 24 y 48 horas desde el registro; D7, entre los días 7 y 8. Los denominadores excluyen a las cohortes inmaduras.
- Las métricas D1/D7 anteriores se conservan sin cambios. Los nuevos resultados aparecen en el texto de metodología del Centro de crecimiento existente, sin más tarjetas.
- No cuentan mensajes privados, Me gusta, visitas, Stories, Reels, publicaciones sensibles o privadas. No se consultan cuerpos de mensajes ni textos de comentarios.
- Sin nuevas tablas, registros externos, seguimiento de sesiones, comunicaciones automáticas ni cambios de monetización.
- Pruebas de agregación, cohorte y datos aislados en PostgreSQL 18.

**Interpretación:** reflejan aportaciones que siguen visibles en el momento de la consulta, no sesiones, visitas ni una secuencia ininterrumpida de retornos.

**Verificación:** CI antes y después de la fusión; despliegue Coolify confirmado por separado.
