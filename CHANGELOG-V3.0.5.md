# RedLibertad V3.0.5 — Perfil propio con publicaciones completas

**Base estable:** V3.0.4 fusionada en `main` por PR #155, commit `74d85a356f72f38eb7e6894400df0353c9bbaddc`.

## Problema observado

El perfil propio seguía usando una cuadrícula de miniaturas recortadas mientras que, desde V3.0.3, los perfiles ajenos muestran publicaciones completas con texto, fotos y acciones como en el feed.

## Corrección implementada

- Se elimina la cuadrícula `explore-grid profile-grid` de `#profilePosts` y se sustituye por un contenedor vertical `own-profile-feed` dentro de la misma vista de perfil.
- Se renderizan las publicaciones mediante `postHTML()` y se enlazan sus acciones mediante `bindPostActions()`, conservando me gusta, comentarios, encuestas, republicaciones, guardar, compartir y gestión de publicaciones propias.
- Se preservan las pestañas Publicaciones, Republicados y Multimedia. Todas muestran tarjetas completas en lugar de miniaturas.
- Fotos y vídeos completos usando `object-fit: contain`, anchura adaptable, altura máxima apropiada, una columna y espacio para la navegación inferior móvil.
- Se conserva el encabezado de perfil, avatar, portada, edición, compartir, Centro de creador, menú Más, privacidad, verificación y consentimientos.
- Se protege el renderizado frente a respuestas HTTP fallidas y llamadas antiguas al cambiar de pestaña rápidamente.
- Se utilizan los mismos endpoints y reglas de acceso, visibilidad y privacidad: no se añaden rutas nuevas ni cambios en PostgreSQL.

## Validación

1. GitHub Actions y 14 pruebas específicas deben terminar en verde. No fusionar hasta autorización del usuario.
2. Tras fusionar y desplegar, confirmar `/api/health` con versión `3.0.5`.
3. Abrir **Perfil** con una cuenta que tenga una foto, una publicación de texto y un vídeo: deben aparecer como posts completos con su tamaño natural, sin cuadrículas.
4. Probar «Publicaciones», «Republicados» y «Multimedia» y cambiar rápidamente entre pestañas para verificar que el contenido coincide con la seleccionada.
5. Comprobar me gusta, comentarios, Guardar, Compartir, opciones ⋯ de gestión propia, encuestas y contenidos restringidos.
6. Probar en ordenador y móvil (360–430 px), sin recorte de imágenes ni barras de desplazamiento anidadas.
7. Confirmar que «Editar perfil», «Centro de creador», «Más», las estadísticas, los consentimientos y el perfil de otras personas no han cambiado.

## Protección

Sin migraciones de BD, sin cambios destructivos de posts, usuarios, fotografías, vídeos o mensajes. No se activa monetización. Las pruebas automáticas no sustituyen la comprobación real en Coolify.
