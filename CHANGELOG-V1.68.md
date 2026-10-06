# RedLibertad V1.68.0 — Performance & Reliability 2.0

Base: V1.67.0 — Accessibility & UX Quality 2.0.

- Timeout y reintento controlado para GET de API.
- Deduplicación de GET simultáneos.
- Protección contra carreras al cambiar de feed.
- Avatares con loading=lazy y decoding=async.
- Service Worker con timeout y fallback cacheado.
- Pool PostgreSQL configurable y controlado.
- Índices de rendimiento para feed, contadores, seguidores y bloqueos.
- Endpoint /api/ready con prueba real de base de datos.
- Registro de APIs lentas sin cuerpos ni datos privados.
- Apagado limpio en SIGTERM/SIGINT.
- Timeouts HTTP explícitos.
- Mobile-first.
- Sin monetización.
