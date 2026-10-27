# V3.3.37 — Conversaciones reales: sincronización al cambiar de chat

- Una actualización SSE lenta de la conversación anterior ya no bloquea la del chat recién abierto: las lecturas se coordinan por cuenta, conversación y generación de navegación.
- Las señales repetidas para el mismo chat siguen reutilizando la consulta pendiente, sin sondeos ni nuevos intervalos.
- Una respuesta tardía no puede sustituir el hilo de otro chat, mostrarse tras salir de Mensajes o cruzar la sesión de otra cuenta. Se evita reutilizar solicitudes HTTP deduplicadas de cuentas anteriores.
- Los mensajes se recuperan del endpoint privado existente; se conservan los permisos, filtrado de bloqueos y el aviso de mensajes reales.
- Sin cambios de diseño móvil, nuevos mensajes artificiales, campañas, notificaciones automáticas, emails, pagos ni base de datos.
