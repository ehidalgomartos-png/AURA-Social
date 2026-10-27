# V3.3.32 — Auditoría general y consolidación

- Se alinea la versión declarada de la aplicación, de `/api/health` y de `/api/ready` con V3.3.32. Antes figuraba V3.2.77 y podía confundirse con un despliegue obsoleto. El commit de Coolify se sigue obteniendo solo de SOURCE_COMMIT, sin inventarlo.
- Se renueva el espacio de caché público de la PWA a V3.3.32 para sustituir el shell anterior y sus recursos estáticos. Las rutas API autenticadas, medios privados y contenido administrativo siguen excluidos de la caché.
- Se adaptan pruebas históricas que aún afirmaban la versión o caché antiguas y se incorpora una auditoría CI de salud, identidad, permisos, PWA y límites de verificación de producción.
- No se alteran diseños móviles/escritorio, usuarios, publicaciones, economía, emails ni base de datos.
- Importante: GitHub Actions no sustituye la comprobación de despliegue de Coolify ni la auditoría visual real de dispositivos.
