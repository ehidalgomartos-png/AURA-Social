# Resuelve V3.5.36 — Peticiones reales en las que puedo ayudar

En la portada de Resuelve, las personas con sesión que **ya hayan elegido voluntariamente sus temas** pueden ver una selección de hasta tres peticiones abiertas recientes que coinciden con sus preferencias. El bloque no se muestra si la cuenta no tiene temas elegidos o si no existen preguntas apropiadas.

Se reutilizan las APIs de preferencias y peticiones `/api/resuelve/help-topics` y `/api/resuelve/questions/for-me`, ambas privadas y dependientes de la identidad de la sesión. El servidor excluye las preguntas propias, preguntas ocultas/resueltas y cuentas de autor inactivas.

La selección no crea respuestas, no inventa perfiles, no activa suscripciones ni notificaciones y no envía mensajes automáticamente. El botón «Ver todas las peticiones para ayudar» lleva al filtro existente «Puedo ayudar». Los títulos se muestran mediante `textContent` y se enlazan a preguntas concretas de la plataforma.

La presentación funciona en móvil, con tarjetas de una sola columna y controles táctiles cómodos. Para refrescarla se vuelven a consultar las preguntas después de iniciar sesión o modificar preferencias, sin guardar actividad oculta.

Validar GitHub Actions y PostgreSQL 18 antes de fusionar; comprobar Coolify de forma independiente.
