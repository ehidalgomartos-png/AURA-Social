# RedLibertad V1.16.0 — Fans & Creator Engagement

Base estable: RedLibertad V1.15.0 — Creator Audience & Broadcasts.

## Engagement privado
- Nueva sección Fans y engagement dentro del Centro de creador.
- Ventana de análisis: últimos 30 días.
- Métrica de seguidores activos.
- Porcentaje de seguidores actuales que han interactuado.
- Total de Me gusta, comentarios y republicaciones recibidos en el periodo.

## Fans más activos
- Top 10 privado de seguidores actuales con más interacción reciente.
- El orden utiliza una suma simple y transparente:
  - 1 Me gusta = 1 interacción.
  - 1 comentario = 1 interacción.
  - 1 republicación = 1 interacción.
- Se muestra el desglose real de cada tipo de interacción.
- Solo se incluyen usuarios que siguen actualmente al creador y están activos.
- Los guardados no se usan para identificar ni rankear personas.
- El ranking no se publica en perfiles ni se muestra a otros usuarios.

## Contenido que más conecta
- Top 5 de publicaciones con mayor actividad en los últimos 30 días.
- Incluye cifras agregadas de Me gusta, comentarios, republicaciones y guardados.
- Los guardados solo aparecen como total agregado por publicación.
- Las publicaciones sin actividad reciente no aparecen en el ranking.
- Cada elemento abre directamente la publicación correspondiente.

## Rendimiento
- Las interacciones se agregan en bloque para evitar consultas repetidas por seguidor.
- El cálculo de contenido usa agregaciones por post antes de ordenar el Top 5.
- Diseñado para escalar mejor a creadores con audiencias grandes.

## Base de datos y compatibilidad
- No añade tablas ni columnas nuevas.
- No requiere migración SQL.
- Reutiliza follows, likes, comments, reposts, saved_posts y posts.
- Conserva V1.12 Verification & Trust, V1.13 Creator Hub, V1.14 Creator Profile & Links y V1.15 Creator Audience & Broadcasts.
- /api/health actualizado a 1.16.0.
- Caché PWA actualizada a V1.16.
