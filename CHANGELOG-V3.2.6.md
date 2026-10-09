# RedLibertad V3.2.6 — Selección y calendario editorial manual

Base estable en GitHub: V3.2.5 fusionada a main, PR #164, commit 4e246da9e21563d6308a7beedaefcbe011528aae.

## Alcance entregado
- Administración → «Selección y calendario manual».
- Orden orientativo de las últimas 200 noticias editoriales aprobadas y aún no publicadas. Se muestra por qué se priorizan: actualidad del RSS, calidad confirmada para la revisión vigente, estado de la fuente y perfil, prioridad humana y diversidad de fuente/categoría en los 7 días anteriores.
- Filtrado por categoría, fuente, búsqueda y calidad «apta» o «pendiente/retener».
- Administrador puede asignar prioridad baja/normal/alta, fecha objetivo opcional y nota contextual. Planificación guardada en PostgreSQL con revisión de candidato, autor y auditoría. Se puede eliminar sin perder la noticia aprobada.
- Calendario agregado de objetivos, día de Madrid, con máximo seis objetivos por día en el piloto. Límite aplicado de forma transaccional entre administradores.
- El calendario es manual: no hay cron, cola diferida, disparador ni publicación al llegar la fecha. Para publicar sigue siendo obligatorio entrar en Centro Editorial → Publicaciones editoriales y confirmar.
- Se respetan aprobaciones, límites y controles de calidad de V3.2.2–V3.2.5; no se crean perfiles o interacciones falsas ni se tocan medios del VPS.

## Características del ranking
- No es una puntuación de veracidad, actualidad semántica, tendencia ni popularidad predicha.
- Señales transparentes y observables. Una noticia antigua puede tener prioridad por decisión del editor, pero aparece señalizada.
- La selección no edita texto, no detecta información falsa y nunca valida derechos por sí sola.
- El cambio de revisión editorial invalida la planificación anterior como vigente hasta que se confirme de nuevo; se avisa en el panel.

## Precauciones y pruebas antes de fusionar
1. GitHub Actions en verde, incluida la suite test:editorial-planning y todas las regresiones previas.
2. En staging o copia: cargar varios candidatos aprobados, algunas fuentes repetidas y una noticia antigua; comprobar orden y explicaciones.
3. Comprobar filtros categoría/medio/calidad/búsqueda y funcionamiento móvil.
4. Asignar prioridad alta y fecha objetivo, recargar y comprobar persistencia.
5. Planificar seis noticias el mismo día de Madrid, intentar la séptima: rechazo 409. Cambiar un objetivo de fecha y comprobar que libera el cupo.
6. Guardar una fecha pasada o a más de 90 días: rechazo. Revisar horario de verano/fecha de Madrid.
7. Con dos administradores, comprobar rechazo de edición con versión antigua y auditoría.
8. Confirmar que la planificación nunca crea un post editorial ni social, no envía notificaciones y no inicia workers.
9. Verificar publicación manual existente, centro de calidad, chats, multimedia local y las comunidades.
10. Tras desplegar, verificar /api/health con versión 3.2.6; conservar previamente copia manual PostgreSQL + volumen multimedia.

## Siguiente fase sugerida
V3.2.7 — flujo editorial diario asistido y reportes de planificación/ejecución, manteniendo publicación manual hasta autorización separada. No se activa monetización.
