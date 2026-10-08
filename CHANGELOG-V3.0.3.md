# RedLibertad V3.0.3 — Profile Experience Polish

**Base estable:** V3.0.2 fusionada en main mediante PR #153, commit `7aa90524b347d9bacd56785bfd76923d98bbea50`.

## Reporte de usuario
- Al abrir el perfil ajeno desde el propio perfil, aparece un modal grande flotante con barra de desplazamiento propia y contenido recortado.
- Las publicaciones se muestran como miniaturas cuadradas que no permiten leer ni ver fotos enteras.
- Aparecen textos «1 publicaciones», «1 seguidores» y una descripción SEO forzada para un solo post.
- La presentación y tamaño de botones en el perfil público podrían mejorar en ordenador y móvil.

## Implementación
- Sustituir el modal de otros perfiles por `publicProfileView`, una sección real dentro de `<main id="appMain">`. El menú lateral de escritorio y la navegación de móvil continúan visibles.
- «← Volver» regresa a la sección anterior (Perfil, Explorar, Conexiones, etc.) y reutiliza la conservación de scroll existente.
- La navegación a la propia cuenta sigue abriendo `profileView` y «Mensaje» abre el chat como siempre.
- Las tres pestañas Publicaciones / Republicados / Multimedia se mantienen y utilizan el mismo endpoint autenticado de posts y sus filtros de privacidad.
- Las publicaciones de terceros se renderizan con `postHTML()` y `bindPostActions()` igual que el feed completo, incluidas fotos y vídeos sin recorte, texto, botones y comentarios.
- Mejoras mobile-first: tarjetas de lectura, portada completa con `contain`, avatar en primer plano, botones con áreas táctiles y ajuste a dos columnas en móvil.
- Corrección singular/plural en perfil ajeno, propio, directorio público y contadores de seguidores en la landing pública.
- Fallback SEO natural sin el error «1 publicaciones públicas» ni recuentos artificiales. Mantiene títulos, canonical y JSON-LD anteriores.
- No se cambia el esquema PostgreSQL ni se migran datos, perfiles, fotos, posts, Reels o chats.

## Comprobaciones
1. Revisar Actions del PR; no fusionar sin permiso.
2. Tras fusionar, comprobar Coolify y `/api/health` versión 3.0.3.
3. Desde Perfil, pulsar el avatar de otra persona: debe abrirse en el área principal, **sin modal** y con botón Volver.
4. Probar acceso a personas desde publicaciones, Descubrir y Conexiones; verificar retorno, botones Seguir, Mensaje, Compartir, Silenciar, Bloquear y Cercanas.
5. Revisar fotos verticales y horizontales, vídeos, posts de texto, Reels y publicaciones largas; confirmar que se ven enteros y sus acciones funcionan.
6. Comprobar modo móvil (360–430px) y ordenador, sin scrollbar anidado del antiguo modal y sin ocultar los botones inferiores.
7. Verificar 0, 1 y varios posts y seguidores, incluidos resultados públicos SEO.
8. Revisar que las cuentas privadas, bloqueadas o con publicaciones restringidas siguen manteniendo sus permisos en el endpoint existente.

## Límites
- V3.0.3 introduce navegación SPA en el área principal, pero no altera la URL ni implementa historial de navegador para cada perfil; «Volver» es el botón visible de la propia interfaz.
- Los posts de Reels conservan controles y restricciones del componente general; no se fuerza reproducción automática en todos los dispositivos.
- CI verifica el código y los regresiones, pero no sustituye pruebas visuales de los navegadores ni validación de producción Coolify.
- Monetización permanece aparcada.
