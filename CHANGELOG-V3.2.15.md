# RedLibertad V3.2.15 — Asistente editorial sin costes externos

Base estable: V3.2.14, PR #173, commit `c1d93c9f1005b388629a9b46d5af8bb77276b676`.

## Funcionalidad
- Sugiere categoría a partir de expresiones explícitas del titular y extracto RSS, con confianza y motivo. Si los metadatos no bastan, conserva la categoría original.
- Señala posibles noticias del mismo tema procedentes de distintos medios mediante coincidencias de términos de sus titulares y proximidad temporal. No rechaza noticias automáticamente.
- Calcula prioridad orientativa a partir de actualidad, metadatos disponibles y noticias parecidas; rota temáticas y fuentes para que la selección no esté monopolizada por un RSS.
- Muestra estas sugerencias en la Mesa editorial diaria y en Revisión de noticias.
- El administrador puede aceptar manualmente un cambio de categoría para una noticia **pendiente**, con confirmación, historial de auditoría y comprobación de versión. Se exige un perfil editorial Ready de esa categoría y se reasigna al mismo. Las noticias aprobadas o publicadas no se recategorizan.
- Conservar la generación provisional de titular y resumen de V3.2.13, sin sobrescribir textos guardados. No se ha añadido un servicio de IA de pago ni se han inferido hechos del cuerpo de artículos ajenos.
- No hay publicaciones, aprobaciones, likes ni usuarios automáticos.

## Limitaciones
- La similitud léxica no demuestra duplicidad informativa; revisa las fuentes originales.
- Las categorías siguen siendo actualidad, tecnología, cultura, deportes, sociedad y entretenimiento.
- Para cambiar la categoría debe existir un perfil editorial preparado de destino.
- La puntuación orientativa de 0 a 100 no expresa la veracidad de una noticia.
- La síntesis final necesita la lectura humana del original para comprobar hechos y contexto.

## Validación de despliegue
1. GitHub Actions y tests específicos V3.2.15, además de regresiones, en verde.
2. Desplegar main y confirmar la versión en /api/health.
3. Entrar en Revisión > Pendientes: aparecen prioridad, propuesta temática y noticias parecidas.
4. Verificar que se ven fuentes diferentes en la cola y también las advertencias en Mesa diaria.
5. Aplicar categoría con perfil preparado: confirmación, nuevo perfil, estado pendiente. Probar sin perfil: bloqueo seguro.
6. Abrir un artículo ya publicado; contenido, sitemap, autoría, comentarios y controles de calidad intactos.
7. Confirmar que ninguna noticia se publica o aprueba automáticamente.
