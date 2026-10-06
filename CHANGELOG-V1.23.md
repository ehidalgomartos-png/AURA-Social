# RedLibertad V1.23.0 — Community Management 2.0

Base estable: RedLibertad V1.22.0 — Creator Community Tools.

## Gestión de participación
- Encuestas y preguntas pueden estar abiertas o cerradas.
- Cerrar bloquea nuevos votos o respuestas.
- Los resultados existentes permanecen visibles según las reglas de privacidad de V1.22.
- Reabrir vuelve a permitir participación.
- Retirar el propio voto o respuesta sigue permitido.

## Archivo reversible
- Encuestas y preguntas pueden archivarse.
- Archivar no borra:
  - votos,
  - respuestas,
  - resultados,
  - relación con la publicación.
- Una herramienta archivada deja de adjuntarse al post visible.
- El creador sigue viéndola en su Centro de creador.
- Restaurar la devuelve a estado activo pero cerrado.
- El creador decide después si quiere reabrirla.

## Respuestas destacadas
- El creador puede marcar respuestas abiertas como destacadas.
- La marca es privada.
- Una respuesta destacada no se publica ni se muestra a otros usuarios.
- Puede retirarse la marca en cualquier momento.
- Las respuestas destacadas se priorizan en la bandeja privada.

## Centro de creador
- Nuevo filtro Activas / Archivadas / Todas.
- Nuevo filtro Solo respuestas destacadas.
- Tres listas separadas:
  - Respuestas.
  - Encuestas.
  - Preguntas.
- Nuevas métricas:
  - herramientas activas,
  - herramientas archivadas,
  - participaciones acumuladas,
  - respuestas destacadas.
- Acciones directas:
  - cerrar,
  - reabrir,
  - archivar,
  - restaurar,
  - destacar,
  - quitar destacada.

## Privacidad
- Las encuestas siguen mostrando únicamente agregados.
- Las identidades de votantes nunca se exponen.
- Las respuestas abiertas completas siguen siendo privadas para el creador y para su autor.
- Destacar una respuesta no cambia esa privacidad.
- Una herramienta cerrada conserva su información visible, pero no acepta nuevos datos.
- Una herramienta archivada desaparece del post sin destruir sus datos.

## Base de datos
- creator_polls.status.
- creator_polls.is_open.
- creator_polls.archived_at.
- creator_questions.status.
- creator_questions.is_open.
- creator_questions.archived_at.
- creator_question_responses.creator_starred.
- creator_question_responses.starred_at.
- Constraints e índices para gestión de estado.
- Bootstrap idempotente.

## Monetización
V1.23 continúa completamente sin monetización activa:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldos,
- sin paywalls.
