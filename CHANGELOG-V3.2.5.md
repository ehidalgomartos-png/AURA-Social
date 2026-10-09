# RedLibertad V3.2.5 — Calidad editorial y métricas comprobables

Base: V3.2.4 fusionada en main, PR #163, commit 3a24606000af2ac0b12ff633334f598f00decfb9.

## Funcionalidad
- Centro Editorial → «Calidad y estadísticas»: métricas agregadas de 30 días de noticias detectadas, aprobaciones/rechazos, publicaciones, likes reales, comentarios visibles y denuncias.
- Estadísticas por fuente: consultas RSS realizadas, candidatos encontrados, duplicados descartados, aprobaciones, rechazos y publicaciones. Sin audiencia inventada, sin rastreadores nuevos, sin métricas de visitas no medidas.
- Cola de comprobación humana para noticias aprobadas, con advertencias **objetivas**: antigüedad de fecha de origen, fuente pausada/no aprobada, perfil no preparado, texto incompleto o enlace no HTTPS.
- Revisión administrativa versionada por candidato con nota y motivo obligatorios y tres confirmaciones independientes (fuente, contexto/hechos, derechos/atribución).
- Estados de calidad «Apta» o «Retenida»; una noticia aprobada no se puede publicar por primera vez sin la confirmación «Apta» para la revisión exacta.
- Si la revisión editorial se reabre/edita y cambia su versión, debe repetirse la comprobación de calidad. Retener una noticia **ya publicada** exige retirarla primero explícitamente para no mantener contenido publicado contradiciendo la decisión.
- Toda evaluación se registra en editorial_audit con administrador, fecha, motivo y revisión.
- No se altera ninguna publicación ya existente durante el despliegue; la barrera nueva afecta a futuras publicaciones manuales.

## Salvaguardas
- Sin ninguna publicación automática, sin usuarios editoriales humanos inventados y sin acceso público a las métricas administrativas.
- No se presenta como detector de noticias falsas: una confirmación humana o una señal de edad no acredita veracidad.
- Tablas PostgreSQL adicionales: editorial_quality_assessments. No se borran medios ni datos antiguos.
- No se realiza scraping nuevo ni API de pago. Mantener VPS, PostgreSQL y Coolify actuales.

## Verificación antes de fusionar
1. GitHub Actions en verde, incluyendo test:editorial-quality.
2. Comprobar que la tabla de evaluaciones se crea sin migraciones destructivas y /api/health muestra 3.2.5 después de desplegar.
3. Verificar métricas frente a datos de muestra en un entorno de staging, sin confundir interacciones reales con alcance/visitas.
4. Intentar marcar apta sin las tres confirmaciones o sin nota de al menos 12 caracteres: se bloquea.
5. Intentar publicar candidata sin evaluación, con evaluación retenida o antigua: error 409.
6. Evaluar apta una candidata aprobada con fuente/perfil listos, luego publicarla manualmente.
7. Retirar una publicación antes de marcarla «Retenida». Comprobar que no se reintroduce actividad automáticamente.
8. Probar colisión de dos administradores sobre la revisión del mismo candidato; comprobar bloqueo/serialización y auditoría.
9. Probar interfaz móvil y regresión de perfiles, comunidades, chat, multimedia local y moderación existentes.
10. Antes del despliegue, conservar copia de seguridad manual PostgreSQL y volumen multimedia.

## Próximas opciones
Después de validar V3.2.5: métricas de evolución temporal, mejoras de selección por relevancia y filtros por fuente/categoría, o calendario de publicación manual. Automatización no se habilita sin decisión posterior explícita.
