# V3.3.21 — Respuestas con contexto y retorno a tu propio comentario

## Propósito
Facilitar conversaciones auténticas aprovechando el editor y el hilo ya existentes, sin crear nuevos bloques o interacciones automáticas.

- Al tocar **Responder** en un comentario real, el editor muestra un fragmento breve de ese comentario bajo el nombre de la persona. El texto se lee únicamente del comentario ya visible y se inserta como texto plano, sin peticiones adicionales.
- Al publicar realmente un comentario o respuesta, la lista vuelve a mostrar **la aportación confirmada por el servidor**, aunque pertenezca a un hilo antiguo. La busca por el identificador de la respuesta real y reutiliza el resaltado existente para comentarios notificados.
- Si el servidor no devuelve un identificador válido o la fila no aparece, mantiene el desplazamiento normal. Las cargas, reintentos y actualizaciones manuales conservan el comportamiento anterior.
- Se respeta el borrador escrito, el destino de la respuesta, la preferencia de no abrir el teclado al solo leer y la posición de lectura al actualizar.
- Sin cambios en backend, PostgreSQL, permisos, privacidad, emails, notificaciones ni monetización.

## Validación
Tests específicos de contexto real, escape de texto, límites, publicación confirmada y desplazamiento. Suite JavaScript completa, PostgreSQL 18 y comprobación independiente del despliegue en producción.
