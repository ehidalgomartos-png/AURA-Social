# Resuelve V3.5.37 — Evolución de la actividad en administración

Se incorpora al panel privado `/resuelve/admin` la sección «Evolución de los últimos 7 días», con una tabla accesible de peticiones, respuestas y problemas resueltos por fecha del servidor.

La API `GET /api/resuelve/admin/activity-7d` exige sesión y permisos administradores. Devuelve solamente agregados por día, nunca autores, textos, correos, contactos o contenido de mensajes.

Peticiones: preguntas públicas no ocultas con autor activo, según fecha de creación. Respuestas: respuestas visibles de autores activos a peticiones públicas no ocultas. Resueltas: preguntas resueltas con una respuesta elegida todavía visible y autores activos, según fecha de resolución.

La serie muestra siete fechas consecutivas y cantidades enteras; las cifras ausentes equivalen a cero. No hay estimaciones ni decisiones automáticas. El administrador puede actualizar la sección sin recargar el panel. Se informa de que la agrupación diaria utiliza el calendario del servidor.

El panel mantiene las bandejas de revisión humana y las métricas generales anteriores. Se deben ejecutar las pruebas y verificar PostgreSQL 18 antes de fusionar, comprobando Coolify por separado.
