# RedLibertad V1.99.0 — Legal Consent Center

Transparencia visible para el usuario sobre el historial legal registrado en su cuenta.

## Incluye
- historial legal en /api/auth/account;
- versiones legales actuales y rutas públicas;
- bloque “Términos y privacidad” en Cuenta y seguridad;
- estados Actual / Histórico / Sin registro;
- versión, fecha/hora y enlace por documento;
- tratamiento explícito de registros legacy;
- backfill legacy endurecido: solo se crea si no existe aceptación versionada y se limpian duplicados sintéticos;
- sin re-consentimiento obligatorio;
- sin cambio de esquema nuevo; incluye corrección de datos legacy defensiva;
- sin monetización;
- sin cambios en src/routes/posts.js.
