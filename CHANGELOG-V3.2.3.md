# RedLibertad V3.2.3 — Publicación editorial manual con atribución

Base: V3.2.2 fusionada en main, PR #161, commit 4a6f20d3c5c08c395ebca417e1f8e5e038f02944.

## Alcance
- Publicación **exclusivamente manual** de noticias aprobadas por una persona.
- Requisitos para publicar: noticia con revisión humana y textos originales, fuente en estado approved, perfil editorial en ready, coincidencia entre fuente, perfil y categoría y enlace al artículo original HTTPS.
- Cola en Administración con vista previa, confirmación expresa, enlace público y retirada inmediata. Máximo inicial de seis publicaciones por día en horario de Madrid.
- Tabla PostgreSQL editorial_publications con 1 publicación por candidato; posibilidad de republicar un candidato retirado si sigue aprobado.
- Portal público /noticias, artículos /noticias/p/:id y perfiles temáticos /noticias/perfil/:slug.
- Enlaces a fuente externa, identificación visible de editorial automatizado y revisión humana, enlace a comunidad pública asociada, SEO básico y sitemap.
- Acceso desde portada y Explorar (móvil/escritorio).
- Audita publicación y retirada en editorial_audit. Los artículos retirados dejan de ser visibles y reabrir un candidato activo queda bloqueado hasta retirarlo.

## Aislamiento deliberado
- No se crean cuentas de usuarios ficticias, ni posts estándar, ni community_posts, ni likes/comentarios inventados.
- La relación con comunidades es un enlace, **no** genera un post dentro de ellas ni integra el feed personal de usuarios. La integración plena es una fase posterior.
- No se copian medios ajenos, titulares RSS completos ni imágenes; solo se publican los textos originales redactados por el editor y un enlace al medio.
- No hay cron, publicación automática, IA de pago ni nueva infraestructura.
- No toca PostgreSQL previo más que añadir estructura editorial; mantiene archivos multimedia del VPS, Coolify y monetización sin cambios.

## Validación antes de fusionar
1. GitHub Actions en verde, test:editorial-publishing.
2. Probar sobre una copia o staging con fuente y perfil autorizados.
3. Aprobar noticia, intentar publicar con perfil draft, fuente paused y revisión obsoleta: debe fallar.
4. Publicar manualmente, confirmar página /noticias/p/:id con autor editorial, nombre del medio, enlace correcto, canonical y versión /api/health 3.2.3.
5. Verificar que el artículo aparece en /noticias, /noticias/perfil/:slug y /noticias/sitemap.xml.
6. Intentar publicar dos veces el mismo candidato: debe devolver 409.
7. Retirar noticia y comprobar 404, no-indexación en sitemap y bloqueo de enlace de comunidad.
8. Intentar reabrir mientras está publicada: debe fallar; después de retirarla debe funcionar.
9. Confirmar que ningún usuario falso, notificación, like, comentario o post estándar fue creado.
10. Revisar experiencia móvil (360-430 px) y escritorios.

Siguiente fase: integración social responsable de noticias en comunidades y feed de RedLibertad. Monetización permanece aparcada.
