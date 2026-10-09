# RedLibertad V3.2.7 — Mesa editorial diaria

Base: V3.2.6 (PR #165) fusionada en main con commit ffedfaddeaa7a341d75ca996c373757f80b4302e.

## Alcance
- Nuevo panel administrativo «Mesa editorial diaria», mobile-first.
- Jornada elegible dentro de ±31 días con referencia a Europe/Madrid y botón Hoy.
- Vista resumida de candidatos RSS pendientes, fechas previstas/vencidas, candidatas preliminarmente aptas, candidatas que necesitan calidad, publicaciones públicas del día y fuentes aprobadas con más de 48 h sin revisión RSS.
- Contadores reales para pendientes, previstos/vencidos y publicaciones del día; el resto muestra cuántos elementos están en la muestra (no lectores únicos).
- Atajos a Centro Editorial, Revisión, Calidad, Planificación y Publicaciones manuales. No se publican artículos al pulsar los atajos.
- Señales visibles para citas antiguas, fecha editorial vencida y planificación obsoleta después de otra revisión.
- Todas las consultas de la nueva API son exclusivamente de lectura. Utiliza el esquema ya creado, no añade tablas y no instala cron ni worker.
- Los controles V3.2.2–V3.2.6 se mantienen en los endpoints existentes (aprobación, calidad, licencia, permisos, límite diario y botón de publicar).

## Límites conscientes
- No se consulta automáticamente RSS; las fuentes con consultas antiguas solo generan avisos.
- No se generan noticias, textos ni imágenes automáticamente.
- Las listas muestran los últimos 35 elementos por sección y revisan un máximo de 300 candidatas aprobadas; los contadores principales (pendientes, por fecha y publicados) provienen de consultas de recuento completas.
- «Apta» en el panel significa que pasan unas comprobaciones preliminares, no certifica la veracidad de una noticia ni elimina la confirmación humana final.
- No se alteran datos de usuarios reales, medios locales del VPS, chats, comunidades ni monetización.

## Validación antes de fusionar
1. CI completo, incluidos test:editorial-daily y regresiones anteriores, en verde.
2. Con datos de staging, navegar entre hoy, ayer y fecha futura y comprobar horas en horario de Madrid.
3. Confirmar que una noticia prevista ayer figura vencida hoy, que una fecha futura no aparece prematuramente como «lista», y que una publicación retirada desaparece del listado público.
4. Comprobar pendientes, aprobadas, calidad retenida, publicadas, y fuente inactiva >48 horas.
5. Verificar los enlaces rápidos en móvil y escritorio.
6. Sin sesión o sin rol admin: la API y el panel deben estar protegidos.
7. Confirmar que no aparecen nuevas publicaciones por consultar el panel ni se activa el motor RSS/cron.
8. Conservar backup de PostgreSQL y volumen multimedia antes de desplegar en Coolify; verificar /api/health versión 3.2.7.

## Próximo paso
Tras validar la V3.2.7, se puede comenzar un piloto manual real con dos o tres fuentes RSS y pocas noticias, para analizar su calidad, utilidad y aceptación antes de estudiar cualquier automatización.
