# V3.3.4 — Recuperar conversaciones reales sin sugerencias bloqueadas

La sugerencia opcional «Una conversación para ti» podía desaparecer si el primer post candidato ya había sido comentado por la persona o el servidor lo rechazaba por privacidad, cambios de visibilidad o concurrencia.

- El feed autenticado devuelve un indicador booleano `commented_by_me` calculado con un `EXISTS` y sin revelar contenido de comentarios. En lectura pública es siempre `false`.
- El selector no elige posts ya comentados, junto con los filtros existentes de privacidad, contenido normal, fecha y autoría ajena.
- Si una candidatura es rechazada, intenta la siguiente (máximo tres intentos, sin repeticiones), manteniendo la verificación atómica del servidor.
- Ante un error de red/servidor no reintenta automáticamente. No hay notificaciones, comentarios ni publicaciones automáticas.
- Se conserva la única tarjeta del resumen de regreso, el límite de 72 horas y «Ocultar 7 días». Diseño mobile-first sin nuevos elementos.
- Se amplía la prueba específica y se actualizan dos regresiones heredadas.

Pruebas completas y PostgreSQL 18 obligatorios antes de fusionar. Despliegue Coolify debe comprobarse separadamente.
