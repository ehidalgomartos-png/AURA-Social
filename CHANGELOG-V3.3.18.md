# V3.3.18 — Primera publicación sin perder el texto

## Objetivo de crecimiento real
La guía de primeros pasos, sugerencias de ideas y publicaciones ya existen. Para reducir el abandono de la primera publicación sin añadir tarjetas a Inicio, esta versión añade al editor existente una opción **voluntaria** para guardar un texto mientras se redacta.

## Comportamiento
- Se muestra solo dentro del ayudante de **primera publicación**, para un usuario cuya etapa «primer post» sigue pendiente según el servidor.
- Un desplegable pequeño contiene **Guardar texto**, **Recuperar texto** y **Eliminar guardado**; no se guarda automáticamente al escribir.
- Se conserva únicamente el texto, limitado a 2200 caracteres, en `sessionStorage`, en la pestaña y para el identificador del usuario autenticado. No viaja a backend ni añade tablas, correos, publicaciones automáticas o analítica adicional.
- Restaurar requiere editor vacío, nunca sobreescribe un texto que el usuario ya había escrito.
- Ante bloqueo de almacenamiento, sesión antigua, texto corrupto o caducado (7 días), la interfaz responde sin bloquear la publicación.
- Tras publicación correcta de un post se elimina el texto guardado. Si falla el envío, se mantiene.
- No se conservan fotos, vídeos ni configuración de audiencia; la persona elige destinatarios antes de publicar.
- Mobile-first y privacidad: desplegable cerrado de forma predeterminada, mensaje sobre dispositivos compartidos y posibilidad de eliminar.

## Validación
Pruebas de almacenamiento opcional, aislamiento entre cuentas, restauración segura, caducidad, ausencia de escrituras en el servidor, regresiones del compositor y PostgreSQL 18. Como siempre, fusión y despliegue son pasos independientes.
