# V3.5.35 — Sugerencias de preguntas relacionadas

Al escribir el título de una petición, Resuelve consulta las preguntas públicas relacionadas y ofrece hasta cinco coincidencias **reales**. Los resultados se obtienen únicamente de títulos de preguntas visibles de usuarios activos; pueden incluir preguntas abiertas y soluciones elegidas y aprobadas editorialmente. Estas últimas tienen prioridad.

La búsqueda ignora palabras comunes y utiliza fragmentos significativos del título en una consulta SQL parametrizada. No consulta ni expone contenidos ocultos, correos, respuestas sin revisar ni datos personales del cuerpo de las preguntas.

El navegador retrasa 450 ms las consultas mientras se escribe y descarta resultados de solicitudes desactualizadas. Si no hay coincidencias o la API falla, se puede publicar igualmente. Los enlaces se abren en una pestaña nueva para no perder el borrador. Ningún resultado se aplica automáticamente, no se generan respuestas ni se publica nada sin pulsar «Publicar petición».

La API pública `GET /api/resuelve/questions/similar?titulo=` valida entre 8 y 125 caracteres. Se deben comprobar especialmente títulos genéricos, coincidencias sin revisar, conservación del texto al navegar y privacidad. Validar GitHub Actions y PostgreSQL 18 antes de fusionar; desplegar y verificar en Coolify por separado.
