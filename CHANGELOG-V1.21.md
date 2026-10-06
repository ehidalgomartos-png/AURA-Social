# RedLibertad V1.21.0 — Creator Content Calendar

Base estable: RedLibertad V1.20.0 — Creator Publishing Tools.

## Calendario editorial
- Nueva sección Calendario editorial dentro del Centro de creador.
- Vista mensual con seis semanas.
- Navegación mes anterior, Hoy y mes siguiente.
- Estados visuales diferenciados:
  - Borrador.
  - Programado.
  - Publicado.
- Los contenidos Solo VIP conservan un distintivo propio.
- Filtro por audiencia.
- Filtro por etiqueta interna.

## Organización privada
- Nueva columna posts.editorial_date.
- Nueva columna posts.editorial_label.
- La fecha editorial es independiente de la fecha pública y de scheduled_for.
- La etiqueta interna admite hasta 40 caracteres.
- Ambos campos son privados y solo accesibles al creador propietario.
- Pueden editarse en:
  - borradores,
  - contenido programado,
  - publicaciones ya publicadas.

## Colocación en calendario
- Si existe editorial_date, esa fecha tiene prioridad para organizar el contenido.
- Si no existe:
  - scheduled usa scheduled_for,
  - live publicado usa created_at,
  - draft sin fecha editorial queda fuera de la cuadrícula y permanece en la cola.
- Cambiar editorial_date nunca reprograma ni modifica la fecha pública.

## Interacción
- Tocar un contenido publicado abre la publicación.
- Tocar un borrador o programado desplaza la vista hacia su tarjeta de gestión.
- Las tarjetas de borrador/programado incluyen edición rápida de fecha editorial y etiqueta.
- El listado de contenido publicado también permite editar esos metadatos privados.
- El compositor incluye fecha editorial y etiqueta para creadores verificados.

## API
- GET /api/posts/creator/calendar
  - privado,
  - rango máximo de 45 días,
  - respeta el rango ISO real enviado por el navegador.
- PATCH /api/posts/creator/editorial/:id
  - solo permite modificar contenido propio,
  - valida fecha y longitud de etiqueta.
- Bootstrap idempotente en posts y profiles.

## Base de datos
- Índice idx_posts_creator_editorial_date.
- No se modifica la visibilidad pública ni las reglas de contenido.
- No se toca el scheduler V1.20.

## Monetización
V1.21 sigue completamente sin monetización:
- sin pagos,
- sin suscripciones,
- sin precios,
- sin checkout,
- sin créditos,
- sin saldo,
- sin paywalls.

El calendario funciona igual para contenido público y VIP gratuito.
