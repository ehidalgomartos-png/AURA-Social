# RedLibertad V1.98.0 — Legal Consent Versioning & Audit Trail

Mejora de cumplimiento y trazabilidad sobre V1.97.0 estable.

## Incluye
- nueva tabla legal_acceptances;
- versiones legales explícitas 1.0;
- Términos y Normas registrados como accepted;
- Privacidad registrada como acknowledged;
- origen y timestamp auditables;
- registro dentro de la misma transacción de alta;
- backfill honesto de terms_accepted_at como versión legacy;
- historial incluido en la exportación de datos;
- eliminación en cascada al borrar cuenta;
- sin monetización;
- sin cambios en src/routes/posts.js.
