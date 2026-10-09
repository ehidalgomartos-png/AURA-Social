# RedLibertad V3.2.23 — Importar noticia desde una URL web

**Base estable:** V3.2.22 — commit `3031647d2dab51b68c706b02f3c23d1c2f4098ba`.

## Nueva herramienta administrativa

En **Centro Editorial → Crear noticia desde una página web**, el administrador puede:

1. Pegar la URL HTTPS de una noticia de un periódico, revista o medio.
2. Analizar de forma **manual** sus metadatos públicos, con un límite de 700 KiB, timeout, TLS verificado y fijación de DNS a direcciones públicas. No sigue redirecciones ni consulta dominios privados.
3. Ver título original, descripción, nombre del medio y presencia de posible foto OG/Twitter; también ofrece un borrador de titular y resumen **provisional** sin IA de pago.
4. Elegir categoría y un perfil editorial **preparado** de la misma categoría; editar titular, resumen propio (mínimo 70 caracteres) y nota interna.
5. Confirmar expresamente que comprobó la fuente, que revisará el texto y que **la foto no está licenciada automáticamente**.
6. Guardar en la bandeja **Pendientes**, en vez de publicar. El sistema comprueba duplicados y genera una fuente `source_kind='web'` para la URL original, aprobada expresamente por el administrador y configurada como `rights_mode='link_only'`.

## Fotografía
Si la página tiene `og:image` o `twitter:image` válidas, la imagen se conserva **solo como sugerencia de URL**. Tras guardar la noticia, se puede previsualizar desde la revisión, gracias al sistema privado de imágenes V3.2.22. La foto **NO se descarga ni publica** sin una licencia documentada de la fuente y permiso comprobado de esa fotografía concreta. Es posible publicar el texto editorial sin foto.

## Webs sin metadatos o bloqueadas
Si el medio requiere JavaScript, usa paywall o bloquea la consulta, la herramienta ofrece **introducción manual** del titular y breve descripción de referencia. La URL HTTPS sigue validándose, pero no se importa ni presume contenido no accesible. En modo manual no se asigna fotografía.

## Seguridad y compatibilidad
- Fuentes RSS y web conviven sin confundir su origen: no se intenta consultar una `source_kind='web'` como RSS.
- Las reglas de originalidad, revisión humana, comprobación de derechos, control de calidad y publicación manual anteriores se mantienen vigentes.
- La fuente web tiene una URL de artículo fija para preservar trazabilidad, aunque es posible editar otros datos de gestión/autorización en el panel existente.
- Se usa `editorial_sources`, `editorial_candidates` y `editorial_audit` con cambios aditivos, sin borrar noticias ni modificar publicaciones existentes.
- Sin publicaciones automáticas, sin scraping masivo, sin IA de pago ni reproducción de textos completos de medios.

## Tras desplegar
Comprobar `https://redlibertad.com/api/health` versión `3.2.23`, pegar una URL real en el Centro Editorial, revisar la vista previa, guardar en Pendientes y comprobar que no se publica hasta completar aprobación y calidad. La imagen solo se usa con permiso específico.
