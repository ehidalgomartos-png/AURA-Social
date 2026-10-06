# RedLibertad V1.22.0 — Creator Community Tools

Base estable: RedLibertad V1.21.0 — Creator Content Calendar.

## Herramientas de comunidad
- Los creadores verificados pueden añadir una herramienta de comunidad al crear una publicación.
- Tipos disponibles:
  - Encuesta.
  - Pregunta abierta.
- Compatibles con Público y Solo VIP.
- Compatibles con publicación inmediata, borradores y programación.
- El enunciado de comunidad puede ser el único contenido del post.

## Encuestas
- Pregunta de hasta 300 caracteres.
- Entre 2 y 4 opciones distintas.
- Opciones de hasta 120 caracteres.
- Un voto por usuario y encuesta.
- Voto editable.
- El usuario puede retirar su voto.
- Resultados visibles como porcentaje y total agregado.
- No se exponen identidades de votantes.

## Preguntas abiertas
- Enunciado de hasta 300 caracteres.
- Una respuesta por usuario.
- Respuesta de hasta 1000 caracteres.
- La respuesta puede actualizarse.
- El usuario puede retirarla.
- En el post se muestra únicamente:
  - número total de respuestas,
  - la propia respuesta de la cuenta actual.
- Las respuestas completas de otros usuarios nunca viajan en las APIs públicas de posts.

## Centro de creador
- Nueva sección Comunidad · respuestas y encuestas.
- Resumen privado:
  - encuestas creadas,
  - votos recibidos,
  - preguntas abiertas,
  - respuestas recibidas.
- Bandeja de respuestas abiertas recientes con identidad del usuario.
- Resumen de encuestas recientes con resultados agregados.
- Enlaces directos a la publicación correspondiente.

## Privacidad
- Las reglas de visibilidad del post se aplican antes de votar o responder.
- El contenido VIP exige acceso VIP también para interactuar.
- Los bloqueos siguen aplicándose.
- Si una persona pierde acceso posteriormente, puede retirar su voto o respuesta sin recuperar datos del post.
- Votantes nunca se identifican en el Centro de creador; solo se muestran agregados.
- Las respuestas abiertas sí muestran identidad únicamente al creador propietario, porque son respuestas dirigidas a él.

## Experiencia de publicación
- El compositor muestra campos dinámicos según Encuesta / Pregunta abierta.
- Las cuentas no verificadas no pueden usar estas herramientas.
- Los borradores y el calendario identifican correctamente el tipo de contenido y su enunciado aunque no exista caption.

## Base de datos
- creator_polls.
- creator_poll_options.
- creator_poll_votes.
- creator_questions.
- creator_question_responses.
- Índices para opciones, votos y respuestas.
- Relaciones con ON DELETE CASCADE.
- Bootstrap idempotente.

## Monetización
V1.22 sigue sin monetización activa:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldo,
- sin paywall comercial.

Las herramientas de comunidad funcionan tanto en contenido público como en VIP gratuito.
