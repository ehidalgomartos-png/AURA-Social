# RedLibertad V2.15.0 — Alertas operativas y seguimiento 3.0

**Base estable:** `6babdb33938bacb3ba1d8c26331ecb2cd4e5ec5b` (V2.14, PR #144 fusionado).

## Cambios reales
- Evaluación de señales operativas cada **2 minutos** mientras la aplicación esté levantada (intervalo no bloqueante).
- Señales para PostgreSQL inaccesible, conexiones en espera, volumen multimedia inaccesible, espacio bajo, picos de errores 5xx y latencia alta.
- Historial persistente y deduplicado en PostgreSQL, sin guardar direcciones IP, usuarios finales, rutas privadas o mensajes de chat.
- Una alerta se agrupa por clave fija. Como máximo se actualiza cada 5 minutos mientras permanece activa.
- El aviso se marca «Señal recuperada» cuando cesa; la revisión/cierre es manual. Si reaparece después de recuperarse, vuelve a abrirse.
- La bandeja en Administración (mobile-first) permite filtrar abiertas, en seguimiento, resueltas y todas; reconocer, añadir nota de resolución y revisar historial.
- Cambios administrativos atómicos con audit trail, validación de entrada y permisos exclusivamente de administrador.
- Sin notificaciones a usuarios, sanciones automáticas, borrados ni cambios de monetización.

## Nuevas tablas, aditivas
- `operational_alerts_v215`: alertas deduplicadas por clave, intensidad, seguimiento y fechas.
- `operational_alert_audit_v215`: historial inmutable de decisiones administrativas.

Ambas se crean con `CREATE TABLE IF NOT EXISTS` y sus índices con `CREATE INDEX IF NOT EXISTS`; no se modifica ninguna fila existente de usuarios, posts o multimedia.

## Consideraciones importantes
- Las métricas de rendimiento de V2.13 son **por instancia**; en despliegues con varias réplicas, las señales se basan en la instancia donde se ejecuta la tarea.
- Si PostgreSQL falla, **no es posible almacenar la alerta en PostgreSQL**. Se genera un aviso genérico en el registro del proceso; se necesita vigilancia externa de Coolify para detectar caídas completas.
- No mide por sí mismo uptime público ni envía emails/push al administrador; el panel es una bandeja interna.
- Se requieren suficiente volumen y frecuencia de fallos para generar alertas de API, evitando falsos positivos cuando hay poco tráfico.
- Las alertas resueltas no se reabren constantemente mientras continúa la misma señal; solo si se recupera y posteriormente vuelve a fallar.
- La interfaz no ejecuta acciones automáticas de reparación que podrían arriesgar datos.

## Comprobaciones tras autorización de fusión
1. Revisar Actions del PR, incluidas las nuevas pruebas y regresiones anteriores.
2. Fusionar solo cuando el usuario lo autorice.
3. Verificar Coolify y `GET /api/health` con `version:2.15.0` y `GET /api/ready`.
4. En móvil, abrir Administración → Bandeja técnica, filtros, reconocimiento, resolución e historial.
5. Comprobar posts, mensajes, multimedia, push y operaciones administrativas.
6. Revisar las nuevas tablas y que no haya pérdida de publicaciones o usuarios.
