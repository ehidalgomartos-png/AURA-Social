# RedLibertad V2.2.0 — Legal Consent Receipt & Private Export

## Mejoras
- Descarga desde Cuenta y seguridad → Términos y privacidad.
- Nuevo GET /api/auth/account/legal-consent/receipt autenticado, privado y sin caché.
- Exporta solo cuenta (username y fecha de alta), documentos actuales (versión/ruta) y los registros reales de aceptación/lectura (acción, versión, origen y fecha).
- Respeta registros legacy, no inventa consentimientos, ni afirma que los documentos vigentes sean copias históricas.
- Archivo informativo sin firma ni certificación digital, sin correo, mensajes ni datos de terceros.
- Estilos móviles, mensajes accesibles y manejo de error de descarga.
- Test unitario de construcción de comprobantes, tests del historial existentes, check de sintaxis y CI.
- Actualiza /api/health, package, PWA, README y checklist.

## No cambia
- Versiones actuales 1.0 ni textos legales.
- Esquema de base de datos o tabla legal_acceptances.
- src/routes/posts.js, monetización o sistema de registro.
