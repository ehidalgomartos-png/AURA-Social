# RedLibertad V2.20.0 — Retención y comunidad

**Base exacta:** V2.19.0 en `main` (`e09a8044fc0d2d3a39201bb65905f3ea1d74358d`, PR #149 fusionado).

## Implementado
- Nueva sección en Inicio: **Conversaciones para retomar**, exclusiva para personas autenticadas.
- Sugiere hasta tres comunidades a las que la persona **ya pertenece**, con publicaciones de otros miembros durante los últimos siete días.
- Solo contabiliza publicaciones **publicadas y de nivel normal**; autores activos, sin bloqueos ni silencios con el usuario.
- Las comunidades cuyo propietario esté bloqueado o silenciado quedan fuera, como también las sugerencias que el usuario haya ocultado.
- Para limitar tiempo de consulta: máximo 40 membresías candidatas, y hasta 10 publicaciones por comunidad. Son recuentos orientativos, no métricas exactas ni avisos de mensajes sin leer.
- Botón **Ver comunidad** enlazado a la navegación existente; botón **Ocultar 7 días** opcional y persistente por usuario y comunidad.
- Si no hay actividad elegible, no se muestra la sección. No se envían emails, notificaciones push ni mensajes automáticos.
- Nuevo módulo API `src/routes/retention-v220.js`: GET `/api/growth/retention/communities` y POST `/api/growth/retention/communities/:id/snooze`.
- Solo el miembro autenticado puede guardar su preferencia; el API nunca acepta un identificador de usuario externo.
- Componente UI accesible, mobile-first, controles táctiles, respuestas vacías y respeta movimiento reducido.
- Regresión HTTP, de privacidad y de frontend integrada en GitHub Actions.

## Base de datos y protección
- Una tabla **aditiva** e idempotente: `community_return_snoozes_v220` (user_id, community_id, hidden_until y updated_at).
- Las referencias usan eliminación en cascada de preferencias huérfanas; **no se eliminan ni actualizan posts, usuarios, conversaciones, archivos o comunidades**.
- El nombre de comunidad y el número aproximado de publicaciones son los únicos datos de contenido mostrados por este endpoint; no devuelve textos, imágenes ni perfiles de autores.
- Ningún ranking utiliza contenido privado, histórico de mensajes o datos sensibles. No hay tracking externo.
- Monetización sigue aparcada.

## Limitaciones conocidas
- Esta sección no sustituye el feed, Descubrir, las notificaciones ni el resumen de vuelta existente.
- Solo presenta actividad en comunidades ya unidas; no invita a comunidades privadas ni revela su contenido a terceros.
- Los contadores capados a 10 no equivalen a número exacto de mensajes o publicaciones no leídas.
- La personalización actual es por pertenencia y frescura, no por intereses inferidos ni análisis del contenido.

## Validación antes y después del merge
1. GitHub Actions en verde y PR sin fusionar hasta autorización expresa.
2. Después de fusionar, verificar Coolify y versión `2.20.0` en `/api/health` y `/api/ready`.
3. Con una cuenta de prueba miembro, entrar en Inicio: comprobar tarjetas y acceso a la comunidad.
4. Ocultar una sugerencia y verificar que desaparece durante siete días, también desde otro dispositivo.
5. Probar cuentas sin comunidades, comunidades privadas a las que no se pertenece, contenido sensible, bloques y silencios.
6. Confirmar que mensajes, notificaciones, publicaciones, subida de fotos/vídeos y PWA siguen funcionando.
