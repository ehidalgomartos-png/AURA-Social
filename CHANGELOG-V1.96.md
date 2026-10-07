# RedLibertad V1.96.0 — Public Navigation Responsive Polish

Revisión transversal de todas las cabeceras públicas.

## Problema
Las páginas públicas habían evolucionado por separado y utilizaban reglas responsive diferentes. Además, el estilo global de botones aplicaba un ancho mínimo de 160 px desde 640 px, provocando solapamientos entre la marca y la navegación en determinados anchos de escritorio.

## Solución
- nuevo stylesheet compartido public-nav-v196.css;
- botones de navegación pública sin ancho mínimo global;
- navegación de escritorio compacta y sin solapamientos;
- comportamiento contenido en tablet;
- cabecera móvil consistente con marca + Crear cuenta;
- eliminación visual de combinaciones distintas de botones móviles según la sección.

## Cobertura
Perfiles, Publicaciones/hashtags, Comunidades, Eventos, Reels/Multimedia, Buscar, Descubrir, Temas, Historias y plantillas públicas dinámicas de server.js.

Sin migraciones, sin monetización y sin cambios en src/routes/posts.js.
