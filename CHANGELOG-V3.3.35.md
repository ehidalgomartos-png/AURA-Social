# V3.3.35 — Inicio: pestañas coherentes con el contenido real

- Si la persona cambia de «Nuevo» a «Siguiendo», VIP, Cercanas o Para ti y falla la API, Inicio conserva el contenido previamente confirmado y vuelve a seleccionar su pestaña real. No presenta publicaciones del filtro anterior como si pertenecieran al nuevo.
- Si falla una actualización del mismo filtro, conserva lo visible y ofrece un aviso; las respuestas tardías no pisan un filtro más reciente.
- Si cambia de cuenta mientras llega una solicitud pendiente, la respuesta de la sesión anterior no se muestra, y ningún filtro nuevo conserva contenido de otra cuenta tras una lectura fallida.
- Se corrige el texto de «Personas para ti» cuando no hay sugerencias: no presume que se conoce a todos.
- Sin alterar la cronología de «Nuevo», mezcla editorial aprobada, privacidad, preferencias, publicación, emails, servidor ni esquemas. No se agregan paneles ni costes de red.
