# Resuelve V3.5.26 — Transparencia profesional en las fichas de ayuda

Cada persona puede **declarar voluntariamente** un oficio o especialidad en su perfil privado de colaborador. El campo se valida en servidor (3–70 caracteres o vacío) y rechaza enlaces, correos, teléfonos o nombres comerciales con formato de dominio.

La ficha pública sigue siendo voluntaria y desactivada por defecto. Si su titular la activa, aparece una etiqueta «Oficio declarado» y una aclaración inequívoca: RedLibertad **no ha verificado títulos ni identidad profesional**. No hay distintivos de experto verificado ni una clasificación de proveedores. La persona puede cambiar o borrar la especialidad y desactivar su ficha en cualquier momento.

La API de preferencias solo acepta sesión propia y acciones con protección de origen; la API pública solo devuelve la especialidad si el titular consiente publicar su perfil. No se recopilan documentos profesionales, certificados, teléfonos ni datos sensibles.

**Nota:** un sistema de acreditaciones verificadas requeriría un proceso administrativo y legal real, revisión de pruebas, posibilidad de revocación y tratamiento de datos, por lo que no se simula en esta versión.

Validar GitHub Actions completo y PostgreSQL 18 antes de fusionar. Comprobar Coolify por separado.