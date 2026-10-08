# RedLibertad V2.7.0 — Experiencia Social 3.0

## Funciones entregadas
- Modal de comentarios con reintento tras errores de red.
- Protecciones frente a respuestas asíncronas obsoletas entre publicaciones.
- Protección contra doble envío para posts, Stories y comentarios.
- Evita borrar un nuevo borrador cuando llega el resultado de un envío anterior de otro hilo.
- Navegación segura cuando la vista solicitada no existe.
- Limpieza explícita de Object URLs para fotos y vídeos de previsualización.
- Contexto de ayuda con la versión obtenida del servidor.
- Interfaz móvil y mensajes de carga adaptados.
- Suite `tests/social-experience.test.js` y ejecución automática mediante `npm run test:social`.
- Versión, health features, PWA y textos del panel admin actualizados.

## No cambia
- Esquema PostgreSQL ni rutas backend de posts.
- Audiencias, permisos, moderación, datos guardados, documentos legales ni monetización.

## Validación pendiente
- Prueba visual y real en Android, iPhone y escritorio (ver checklist #56).
- Revisión en producción de la matriz P0 de `AUDIT-V2.6.md`.
