# Resuelve V3.5.22 — Mis ayudas

## Para la persona usuaria
Se puede abrir «Mis peticiones» y la nueva pestaña «He ayudado» desde Resuelve. Ambas muestran el resumen **Mis ayudas en Resuelve** con cuatro contadores agregados de actividad propia: peticiones abiertas, peticiones propias con respuestas visibles, problemas marcados resueltos por su autor y peticiones ajenas en las que se ha respondido.

«He ayudado» muestra las peticiones abiertas o resueltas en las que el usuario ha publicado una respuesta visible. Si una de sus respuestas fue elegida por el autor, la tarjeta muestra «Tu ayuda fue elegida». No hay puntos, estrellas, recompensas, ranking, sugerencias ficticias ni avisos automáticos.

## Privacidad
Los endpoints nuevos `GET /api/resuelve/my-activity` y `GET /api/resuelve/questions/answered-by-me` exigen sesión y usan exclusivamente `req.user.id` como identidad. No admiten id de usuario indicado por el cliente. No incluyen datos privados ni contenido oculto de otras personas. La lista pagina por el identificador de la última respuesta propia registrada por petición.

## Comprobaciones
Probar en móvil, ordenador y con cuenta de usuario normal; comprobar que un visitante no ve el resumen. Confirmar que el marcado de una solución depende del autor de la pregunta y que una respuesta no cuenta como problema resuelto. Validar CI y PostgreSQL 18 antes de fusionar; comprobar producción por separado.
