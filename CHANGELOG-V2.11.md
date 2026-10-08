# RedLibertad V2.11.0 — Seguridad avanzada

Base: `6aa5bbf24d74a7fc8004e0b5744fba1c1b299ba3` (V2.10.0).

## Cambios
- Guardia antiabuso para las operaciones sensibles: altas, inicio de sesión, recuperación administrativa, cambio de contraseña, publicaciones, comentarios, mensajes, conversaciones, seguimientos, reacciones, denuncias y difusiones de creadores.
- Contadores atómicos en PostgreSQL compartidos entre instancias: no dependen de la memoria local de un servidor.
- Límites separados por categoría, usuario o red; las lecturas quedan fuera y los límites admiten uso normal.
- Respuestas HTTP 429 con `Retry-After` y segundos restantes, sin suspensiones automáticas de cuentas.
- Identificadores HMAC para redes y cuentas; sin guardar direcciones IP en texto plano en el registro antiabuso.
- Alertas consolidadas por ventana temporal y panel en Administración para revisar manualmente eventos con notas.
- Purgado de contadores tras dos días y de alertas tras 90 días; no se borran publicaciones ni usuarios.
- Pruebas de regresión en GitHub Actions y actualización de versión.

## Seguridad operativa
- La base se inicializa mediante `CREATE TABLE IF NOT EXISTS`, sin `DROP`, `TRUNCATE` ni actualizaciones destructivas.
- Si falla el almacenamiento de límites se devuelve 503 para acciones protegidas. La lectura sigue disponible.
- Los límites existentes de registro y autenticación se conservan como defensa adicional.
- Los hashes se derivan de `JWT_SECRET`. Si cambia la clave, los buckets antiguos dejan de coincidir y caducan.
- El panel administra revisiones, pero no sanciona automáticamente; una decisión humana usa las herramientas de moderación ya existentes.
- Esta versión no agrega monetización.

## Validación y despliegue
1. Verificar GitHub Actions en el PR, incluidas las pruebas V2.11.
2. No fusionar sin autorización expresa.
3. Tras el merge autorizado, verificar despliegue en Coolify y `/api/health` con `version:2.11.0`.
4. Probar desde móvil publicación, comentario, chat, follow, inicio de sesión, denuncia y panel de moderación; verificar 429 y recuperación después de la ventana.
5. Si se supera repetidamente un límite, revisar el panel de alertas antes de sancionar a nadie.
