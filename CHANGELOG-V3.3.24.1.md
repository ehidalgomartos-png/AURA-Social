# V3.3.24.1 — Enlaces externos de perfiles sin protocolo

Hotfix: los perfiles que introducen «lucianthornveil.com» deben enlazar a https://lucianthornveil.com/ y nunca tratar la dirección como una ruta relativa de RedLibertad.

- Un normalizador compartido entre API y navegador añade https:// si falta, conserva http/https explícitos y permite webs con ruta, query y puerto válido.
- Al guardar se valida y normaliza antes de subir archivos; el servidor vuelve a validar para impedir rutas manipuladas. El campo sigue siendo opcional y puede vaciarse.
- Al dibujar perfiles públicos y propios se normalizan también los enlaces **ya guardados** sin reescribir datos históricos. No hace falta pedir a los usuarios que editen sus perfiles.
- Se rechazan esquemas no web, URL relativas, enlaces con credenciales, caracteres inseguros y nombres de host malformados.
- Enlaces externos conservan target=_blank con rel=noopener noreferrer, texto escapado y sin apertura automática.
- El campo explica los dos formatos válidos. El script se carga antes de social.js y se añade a la caché PWA sin cambiar el nombre de caché existente.
- Sin cambios de DB, privacidad, reglas de acceso, actividad, emails ni monetización.

Tests de normalización en Node+navegador, URL maliciosas, visualización histórica, formulario, API, PWA y regresiones. GitHub Actions y PostgreSQL 18 obligatorios antes de fusionar.
