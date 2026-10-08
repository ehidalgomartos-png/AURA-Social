# RedLibertad V2.4.0 — Filtros de historial legal

## Novedades
- Filtros combinables por documento (Términos, Normas, Privacidad) y estado (Actual, Histórico, Legacy).
- Búsqueda de texto por versión, fecha, origen y otras etiquetas ya visibles en el historial.
- Búsqueda tolerante a mayúsculas y acentos, contador en vivo y botón Limpiar filtros.
- Filtros accesibles, nativos y mobile-first, mostrados cuando existen al menos dos registros.
- La selección se conserva si la cuenta refresca el historial durante la sesión.
- Filtrado en cliente, sin nuevas API ni modificaciones a los consentimientos guardados.
- Se mantienen intactas las descargas HTML y JSON y la confirmación individual explícita.
- Nueve pruebas nuevas, más las pruebas legales anteriores.
- Actualización de health, versión 2.4.0, PWA, interfaz admin, README y checklist.

## Sin cambios
- Textos legales, versiones actuales 1.0, base de datos, rutas de autenticación o publicaciones.
- Monetización.

## Validación
Ejecutar npm run check:syntax y npm run test:legal. Revisar también desde móvil y con teclado; checklist #53.
