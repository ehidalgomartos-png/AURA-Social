# RedLibertad V3.2.4 — Participación real en noticias editoriales

Base: V3.2.3 fusionada en main, PR #162, commit 993983b289013cc51f503390f464e107507e24be.

## Entregado
- Noticias aprobadas y publicadas **manualmente** permanecen como secciones editoriales diferenciadas de cuentas humanas.
- Bloque «Noticias para conversar» en Inicio con hasta 3 artículos recientes, nombres de perfiles editoriales y fuentes visibles; no simula posts de otros usuarios.
- En /noticias/p/:id: «Me gusta» de cuenta real, lista pública de comentarios, redactar comentario con sesión, eliminar propio comentario, denunciar comentario inapropiado y compartir enlace mediante Web Share/portapapeles.
- Moderación administrativa de comentarios denunciados: retirar o descartar, con auditoría.
- Compartir en comunidad pública vinculada solo por acción explícita de una persona miembro con cuenta real: respeta bloqueos con propietario, sanciones de comunidad, enlace a noticia existente y unicidad por miembro/comunidad/artículo.
- Al retirar una publicación editorial pública se ocultan sus comparticiones vinculadas en las comunidades para evitar enlaces a un artículo retirado.
- Límites antiabuso: una valoración por usuario/noticia; máximo 20 comentarios por 24 horas y 30 segundos entre comentarios; 600 caracteres por comentario; deduplicación de reportes.
- Persistencia aditiva PostgreSQL, sin modificar mensajes privados, medios locales, perfiles, posts sociales existentes ni monetización.

## Límites
- Solo contenido editorial publicado manualmente y marcado como revisado. No creación de usuarios editoriales ficticios ni seguidores, likes, comentarios o métricas falsos.
- La publicación dentro de comunidades la realiza explícitamente el usuario real; no el bot.
- Los comentarios son públicos, sujetos a revisión humana y denuncias; no se usan imágenes de terceros.
- Sin sistema de push para interacciones editoriales, sin bots de respuesta ni autopublicación.

## QA antes de fusionar
1. CI completo en verde incluida test:editorial-social.
2. Con una publicación aprobada en staging, probar Me gusta, retirarlo, comentar, denunciar, moderar y borrar el propio comentario desde móvil y escritorio.
3. Usar una cuenta sin sesión para verificar lectura pública y acciones de escritura bloqueadas.
4. Comprobar que una cuenta no miembro, bloqueada o sancionada no comparte en la comunidad.
5. Con un miembro real, compartir una noticia y confirmar que aparece una publicación de ese miembro, sin perfil editorial falso.
6. Intentar compartirla por segunda vez: error 409.
7. Retirar noticia: la noticia desaparece de Noticias/Inicio y quedan ocultos los enlaces comunitarios creados para ella.
8. Validar cuentas, chats, perfiles, multimedia persistente y demás funciones sociales.
9. Respaldar PostgreSQL y almacenamiento local antes del despliegue Coolify; verificar /api/health versión 3.2.4.

## Próximo paso sugerido
V3.2.5: métricas editoriales, filtros de relevancia, control de calidad y fuentes (sin activar publicación automática hasta validarla por separado).
