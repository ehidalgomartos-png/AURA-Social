# RedLibertad V3.2.24.1 — Inicio Mobile Polish

Base estable `main`: **V3.2.24** (`9d36ed37d1aa7cb1a5067a4e0a1ccfe042a2762a`).

## Ajustes en Inicio (mobile-first)

1. **Destacados de hoy sin publicaciones**: si no existen destacados pero hay personas recientemente activas, desaparecen la cabecera, el mensaje de «Todavía no hay novedades destacadas», el botón y el carrusel vacíos. Únicamente aparece **Personas con actividad reciente** en una tarjeta reducida, con las tarjetas de personas y acciones originales. Si no hay personas ni destacados, se oculta toda la sección.
2. **Manejo de fallos**: si la API de destacados falla pero la lista de personas recientes es válida, continúa mostrándose la tarjeta compacta. Si no existe ningún dato, la sección se oculta.
3. **Cabecera más ligera**: reduce exclusivamente en Inicio la altura y relleno de la tarjeta de título «Inicio» y de los filtros, manteniendo controles accesibles y desplazamiento horizontal si es necesario. No modifica las demás vistas.
4. **Stories**: cuando no existen historias de otras personas, «Tu Story» ocupa menos altura, manteniendo su acción de crear. Cuando hay otras historias, el carrusel conserva su estilo y funcionalidades anteriores.
5. **Sin cambios de contenido**: el feed sigue priorizando publicaciones auténticas; las noticias continúan intercaladas después de cada dos publicaciones en «Para ti» y «Nuevo» (máximo tres y no repetidas); se respetan «Siguiendo», «Cercanas» y «VIP». Bienvenida/primeros pasos permanecen plegados.

## Detalles técnicos

- Cambios de UI en `public/social.js` y `public/social.css`, controlados con `only-active-v32241` y `solo-story-v32241`.
- Caché de assets móviles actualizada en `public/app.html`.
- Pruebas `tests/home-mobile-polish-v32241.test.js` ejecutan el estado real de `loadHomeMomentum` con cuatro combinaciones de datos y error, y validan el comportamiento de Stories, controles y mezclador 2:1.
- El API público y las migraciones PostgreSQL **no se modifican**.
- `APP_VERSION=3.2.24.1` en servidor/health. Para cumplir SemVer de npm, `package.json` usa `3.2.24+polish.1` (los cuatro componentes numéricos no son válidos en npm). La versión visible de RedLibertad no cambia.

## Verificación después de desplegar
- Comprobar `https://redlibertad.com/api/health` → `version:"3.2.24.1"`.
- Entrar en Inicio con un móvil pequeño: cabecera más corta y primer post más arriba.
- Con solo «Tu Story», su tamaño es más contenido; tras aparecer nuevas Stories vuelve el carrusel normal.
- Sin destacados pero con personas activas, solo se muestra una tarjeta «Personas con actividad reciente» tras el feed.
- Sin destacados ni usuarios recientes, ningún bloque vacío.
- Revisar 2 posts → 1 noticia; filtrar «Siguiendo», «Cercanas» y «VIP» y comprobar que no aparecen noticias agregadas.
