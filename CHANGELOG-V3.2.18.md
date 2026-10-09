# RedLibertad V3.2.18 — Mesa Editorial móvil: búsqueda y filtros rápidos

**Base:** V3.2.17.1 desplegada y recuperada, commit estable `9e4325229a49b6ee7349fc8ce296c320ba0c81b6`.

## Cambios
- Búsqueda local por titular, extracto o nombre de medio, tolerando tildes y varias palabras.
- Filtros combinables de categoría, medio y prioridad orientativa.
- Vistas para noticias relacionadas, noticias sin borrador completo y avisos de metadatos/categoría.
- Contador explícito de resultados: indica que la búsqueda se realiza **solo entre las noticias cargadas**, máximo 100 por estado. No inventa cifras globales ni descarta entradas.
- Navegación táctil anterior/siguiente entre los resultados **visibles**, con aviso si cambian los filtros durante una edición.
- Confirma antes de abandonar una noticia con cambios sin guardar, también al elegir otra noticia o cambiar el estado.
- Corrige el manejador de «Actualizar» para no pasar el evento del botón como supuesto ID de una noticia.
- Diseño responsive de filtros (primero móvil) y controles de al menos 44 px.
- No se modifica la base de datos ni la publicación; ninguna noticia se edita, rechaza, aprueba ni publica mediante estos filtros.

## Garantías
La edición y aprobación interna siguen exigiendo guardado de borrador, consulta de la fuente, hechos, derechos y motivo. La publicación permanece **manual**, con auditoría y atribución. No se requieren servicios de IA de pago. Los filtros no tienen acceso a contenido fuera de la cola administrativa que ya devolvía el servidor.
