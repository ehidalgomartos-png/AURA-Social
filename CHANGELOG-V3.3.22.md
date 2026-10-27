# V3.3.22 — Volver a RedLibertad sin perder las novedades

## Problema resuelto
El resumen «Lo que tienes pendiente» recalculaba «desde tu última visita» sobre una referencia que podía avanzar cada vez que el usuario actualizaba el resumen o consultaba Stories. Se perdía el contexto de novedades auténticas antes de revisarlas, dificultando los regresos D1/D7.

## Cambios
- El resumen mantiene en la pestaña actual una referencia temporal recibida del servidor; cada actualización puede consultar los recuentos de mensajes, novedades y seguidores desde la misma visita.
- El endpoint ya existente /api/growth/pulse acepta opcionalmente una fecha ISO UTC estricta, solo dentro de los últimos 30 días, con rechazo seguro de fechas inválidas/futuras. Sigue aplicando todos los filtros de visibilidad, bloqueos, contenido y permisos.
- El aviso de «visita a Inicio» se escribe una única vez por pestaña y usuario autenticado, solo tras cargar el resumen; una actualización manual no se registra como una nueva visita. Si falla el aviso se puede reintentar.
- Una propuesta de conversación real ya mostrada se conserva en el resumen al refrescar; se sigue pudiendo ocultar siete días y se revalida el acceso antes de abrir el post.
- Las cuentas diferentes no comparten memoria de la pestaña. No se añaden nuevas tablas, cookies, almacenamiento local, correos, tareas en segundo plano ni actividades artificiales.
- La vista sigue compacta en móvil y ordenador, sin tarjetas adicionales en Inicio.

## Validación
Pruebas de parámetros temporales, visitas idempotentes, simultaneidad, cambio de cuenta y conservación de conversación. Suite completa JavaScript y PostgreSQL 18 antes de fusión, validación posterior en main y comprobación separada de Coolify.
