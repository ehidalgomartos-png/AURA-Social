# RedLibertad V3.2.11 — Noticias con experiencia visual de RedLibertad

Base estable de GitHub: V3.2.10, PR #169, commit 66ea18fc96d162d5f35facd4e32fd21700dd5ae2.

## Mejora basada en capturas reales
El primer artículo editorial ya se publica y recibe interacciones, pero en móvil y escritorio se presenta como una página de periódico independiente, con botones que se apilan de forma poco equilibrada, un bloque de comentarios muy separado del resto y sin navegación social reconocible.

## Cambios
- Alineación visual con la propia RedLibertad: colores oficiales navy/marfil/teal, logomarca real, tarjetas tipo publicación, bordes/sombras sociales y tipografía compacta.
- Cabecera con navegación principal; navegación lateral solo en escritorio; navegación inferior en móvil con Inicio, Noticias, Comunidades y Entrar. No se modifica la navegación privada del resto de RedLibertad.
- Noticia individual como tarjeta de feed: avatar **de marca, no de persona**, perfil editorial claramente identificado, fecha de publicación en RedLibertad, categoría y revisión humana.
- Fuente externa destacada en una tarjeta compacta, con enlace y advertencia de que fecha/contexto del medio se comprueban en el original. No se agregan imágenes ajenas ni afirmaciones de actualidad no verificadas.
- Barra social de tres acciones equilibradas, con iconos SVG de buena lectura: Me gusta, Comentar, Compartir. La interacción ya existente conserva sus endpoints y comprobaciones.
- Se muestra el total de Me gusta y comentarios en la misma tarjeta. Comentar desplaza al usuario al formulario; sin sesión aparece CTA de inicio. Comentarios muestran avatar de inicial y autor, fecha, texto seguro, denuncia o eliminación según permisos.
- Vista coherente también para /noticias y /noticias/perfil/:slug, con componentes ya compartidos.
- Atención a móviles estrechos, zonas seguras, objetivos táctiles >=44 px, estados aria y movimiento reducido.

## Límites
- Únicamente presentación y JavaScript de interacciones, ninguna migración de BD.
- No se convierte el perfil editorial en cuenta humana, ni se generan seguidores, mensajes, likes o comentarios falsos.
- El RSS, los artículos publicados, fuentes, enlaces, moderación, permisos, medios persistentes y sistema de publicación manual no cambian.
- El diseño no implica aprobación automática ni reutilización de fotografías protegidas.

## Pruebas y despliegue
1. GitHub Actions, incluida la suite `test:editorial-social-ui`, en verde.
2. Abrir una noticia pública ya publicada y comprobar en iPhone/Android de ~360–430 px y escritorio que navegación y cabecera se parecen a la app social.
3. Pulsar Comentar, Me gusta, Compartir; confirmar actualización de contadores y sesión requerida para operaciones privadas.
4. Probar cuenta sin sesión, con sesión y comentario propio; comprobar denunciar y eliminar.
5. Confirmar enlace original y nombre del medio, sin copias de imágenes ajenas ni falsos usuarios.
6. Abrir /noticias, /noticias/perfil/:slug, comunidades, Inicio y páginas públicas previas.
7. Revisar /api/health versión 3.2.11 tras desplegar en Coolify.
