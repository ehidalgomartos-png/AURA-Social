# RedLibertad V2.5.0 — Legal Status Overview & Pending Documents

## Novedades
- Resumen visible de versiones legales actuales, históricas y ausentes dentro de Cuenta y seguridad.
- Cálculo correcto por tipo de acción (aceptación para Términos/Normas, reconocimiento de lectura para Privacidad).
- Los registros legacy permanecen históricos y no se transforman en consentimiento actual.
- Versiones vigentes desconocidas identificadas sin generar acciones o aceptaciones ficticias.
- Acceso rápido a documentos pendientes mediante scroll y foco; no hace llamadas al servidor ni marca casillas.
- Resumen recalculado tras una confirmación explícita real usando el flujo existente.
- Diseño mobile-first y accesibilidad; se conservan historial, filtros, JSON y HTML legible.
- Versiones de app, health, PWA y panel admin actualizadas a 2.5.0.
- 7 pruebas adicionales; ver sección 54 del checklist.

## Fuera de alcance
- Ningún cambio en textos legales, versión vigente 1.0, SQL, rutas de autenticación ni publicaciones.
- No se activa monetización ni se obliga a aceptar nuevos documentos.

## Validación
Ejecutar `npm run check:syntax` y `npm run test:legal`, más comprobación móvil/desktop en producción.
