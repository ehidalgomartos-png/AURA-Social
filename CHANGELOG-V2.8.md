# RedLibertad V2.8.0 — Descubrir 3.0

## Mejoras
- Tres modos de sugerencias: Para ti, Activos (actividad pública de 7 días, opt-in) y Nuevos (registros de 30 días).
- Priorización de intereses compartidos y actividad pública visible; sin afirmaciones de conexión en tiempo real.
- Paginación del endpoint con indicadores `page`/`hasMore` y botón «Cambiar sugerencias».
- Mantiene filtros de perfiles activos/descubribles y excluye bloqueos, silencios, administradores y personas ocultadas.
- Solo usa posts/Stories publicados y públicos como señales de actividad y respeta `show_activity`.
- Estados móviles y accesibles, botón Reintentar, distinción entre resultado vacío y error de red.
- Protecciones de concurrencia al cambiar filtros, páginas o realizar búsquedas.
- Nuevas pruebas de ranking SQL y comportamiento de interfaz; versión/health, PWA, panel admin, README y checklist actualizados.

## Sin cambios
- No introduce perfiles artificiales, exposición de estados privados ni generación de actividad.
- Sin modificaciones del esquema, contenido, monetización o rutas de publicaciones.
- Mantiene comportamiento de búsqueda explícita y sugerencias en Inicio.

## Validación pendiente
- Ejecutar nuevas pruebas en GitHub Actions y comprobar la experiencia en producción siguiendo el checklist #57.
