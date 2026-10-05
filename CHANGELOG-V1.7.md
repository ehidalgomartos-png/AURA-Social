# RedLibertad V1.7.0 — Retention & Social Momentum

Base estable: RedLibertad V1.6.0.

## Inicio
- Nuevo módulo "Ponte al día".
- Recupera contenido relevante publicado desde la última visita.
- Ventana máxima de recuperación: 7 días.
- Prioridad extra para publicaciones de personas seguidas.
- Ranking por Me gusta, comentarios y republicaciones.
- Contador de novedades en la pestaña Nuevo.

## Destacados
- Cuando no hay contenido pendiente, muestra destacados de las últimas 24 horas.
- Evita repetir publicaciones ya incluidas en "Desde tu última visita".
- El bloque se mantiene visible incluso cuando el usuario está totalmente al día.

## Personas con actividad reciente
- Nuevo carrusel en Inicio.
- Actividad derivada de publicaciones, comentarios, republicaciones y Stories.
- Solo muestra actividad de los últimos 7 días.
- Respeta bloqueos y oculta cuentas administradoras.
- Prioriza intereses compartidos y actividad reciente.
- Permite seguir/dejar de seguir desde el propio módulo.

## Privacidad
- La última visita se guarda únicamente en localStorage del navegador.
- No añade rastreo externo ni telemetría adicional.

## Compatibilidad
- Sin migraciones PostgreSQL.
- /api/health actualizado a 1.7.0.
- Cache PWA actualizado a V1.7.
