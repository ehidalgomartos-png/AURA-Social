# V3.3.3 — Personas con actividad pública real

Mejora las seis recomendaciones existentes del primer círculo, sin otra pantalla ni nuevos permisos.

- Después de priorizar intereses compartidos y personas recién registradas, destaca perfiles que han publicado un post ordinario público y normal durante los últimos 14 días.
- Solo se considera actividad visible si la persona tiene activada la preferencia show_activity. No se infieren conexiones online ni se utilizan publicaciones privadas, VIP o sensibles.
- La tarjeta muestra «Ha compartido una publicación pública en los últimos 14 días» únicamente con confirmación del servidor. Las razones de interés compartido y llegada reciente mantienen prioridad.
- Conserva las exclusiones de bloqueos, silencios, seguidos y sugerencias ocultadas. Seguir a alguien requiere pulsar el botón; no se automatizan interacciones.
- Verificación nueva de componentes, SQL y PostgreSQL 18 usando datos aislados y efímeros.
- No se modifican esquemas, mensajes, preferencias ni monetización.

Pendiente de CI y posterior verificación independiente de despliegue.
