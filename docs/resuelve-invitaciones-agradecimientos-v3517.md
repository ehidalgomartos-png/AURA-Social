# Resuelve V3.5.17 — Invitar, agradecer y compartir soluciones sin publicar automáticamente

## Ayuda a otras personas
- Se añade un módulo opcional «Ayuda a otras personas» tras la lista de peticiones, evitando recargar la cabecera.
- «Invita a ayudar» despliega WhatsApp, Telegram, correo, compartir nativo y copiar enlace.
- El mensaje enlaza `/resuelve`, presenta la comunidad como un espacio para consejos y experiencias, no como una tienda.
- El usuario selecciona destinatario y confirma en su aplicación; no se recopilan contactos, se envían emails desde el servidor ni se crean usuarios automáticamente.

## Agradecimiento
- Solo el autor de una petición resuelta puede agradecer la solución elegida.
- El agradecimiento se guarda una única vez en `resuelve_questions.thanked_at` y se presenta en el detalle.
- No existen puntuaciones, premios, posicionamientos ni ventajas comerciales vinculadas al agradecimiento.
- Reabrir una petición limpia el agradecimiento anterior para que no se asocie a una solución distinta.

## Publícalo en RedLibertad
- En una petición resuelta, el autor dispone de «Publícalo en RedLibertad».
- La API de vista previa exige autenticación, autoría, resolución vigente y una solución visible.
- Se prepara un borrador **solo con el título y el enlace público** de la petición, sin copiar las respuestas de terceros.
- La app abre el editor habitual de publicaciones, conserva un borrador ya empezado y permite editar texto, audiencia y contenido.
- La publicación requiere la confirmación habitual del usuario. El enlace de intención se retira de la URL tras preparar el borrador.
- Ni la creación del agradecimiento ni el botón de compartir generan publicaciones automáticas.
- Se mantiene `noindex,follow` de Resuelve, así como sus reglas de moderación y privacidad.

## Comprobaciones
- Tests HTTP para denegar a invitados, terceros y peticiones abiertas; validar agradecimiento único y bloqueo tras reabrir.
- Tests de integración estática de canales de invitación y editor de RedLibertad.
- Tras el despliegue: comprobar manualmente en móvil invitaciones, agradecimientos y publicación con un usuario real de prueba.
