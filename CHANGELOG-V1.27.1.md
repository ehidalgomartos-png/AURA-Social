# RedLibertad V1.27.1 — Follow-up Dashboard Hotfix

Base: RedLibertad V1.27.0 — Follow-up Dashboard.

## Correcciones
- El resumen de “Hoy” y “Próximos 7 días” usa ahora el mismo límite de día local enviado por el navegador que el listado de seguimientos.
- Los listeners del dashboard dejan de registrarse dentro de cada render del Centro de actividad, evitando ejecuciones duplicadas tras varios refrescos.

## Mejoras directas de seguimiento
- Filtro combinable por prioridad: Todas / Alta / Normal.
- El filtro se aplica en servidor junto con ventana temporal y búsqueda privada.
- Acción individual “Completar seguimiento” desde cada tarjeta.
- Mantiene selección múltiple y acciones masivas existentes.

## Privacidad
- La búsqueda sigue limitada a private_note.
- El dashboard y sus acciones siguen restringidos al creador verificado propietario.
- Las notas no se exponen en feeds, perfiles ni APIs públicas.

## Base de datos
- Sin nuevas tablas ni columnas.
- Se reutiliza creator_community_activity_meta y el índice V1.27 existente.
- Bootstrap continúa siendo idempotente.

## Monetización
- Sin pagos.
- Sin suscripciones.
- Sin precios.
- Sin checkout.
- Sin créditos.
- Sin saldo.
- Sin paywalls.
