# V3.3.11 — Explorar móvil compacto

## Objetivo
Reducir la altura, jerarquía excesiva y recorrido para descubrir personas reales en Explorar móvil. Se respetan los resultados originales, las preferencias y la lógica de recomendaciones.

## Interfaz
- En móvil, búsqueda/filtros de la sección activa antes que conexiones, Marketplace, Noticias y búsqueda global opcional; accesos anteriores siguen operativos.
- Encabezado simplificado; búsqueda de personas en una sola fila y chips de intereses desplazables.
- Resultados como tarjetas de dos columnas (avatar / información), bio de dos líneas y hasta dos intereses visibles con contador +N. Acciones Seguir, Ocultar y Ver perfil conservan endpoints/permisos existentes.
- «Tus conexiones» pasa a resumen compacto (una vista previa), ampliable con «Ver conexiones» para recuperar todos los círculos y acciones; «Abrir centro» se mantiene. El estado desplegado solo vive en el DOM; no se guarda ni se envía a terceros.
- Marketplace y Noticias siguen como accesos directos, situados más abajo y con menor protagonismo visual.
- CSS limitado a #exploreView y anchura móvil. No cambia diseño de escritorio, otras listas de personas, privacidad, bloqueos, monetización ni actividad auténtica.
- Nueva URL de social.css para invalidar cachés móviles.

## Validación
Pruebas nuevas de orden, diseño, accesibilidad, tarjetas y despliegue de círculos; regresiones previas y PostgreSQL 18. Sólo se fusiona si GitHub Actions finaliza en verde.
