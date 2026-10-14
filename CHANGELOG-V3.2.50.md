# RedLibertad V3.2.50 — Marketplace 1.0

Base: V3.2.49.1 estable, commit 97e0bfedff155321a12c3209e128d524eca9a774.

## Alcance
- Marketplace independiente en /marketplace con diseño mobile-first y acceso desde Explorar y el menú lateral.
- Productos, servicios e inmobiliaria: venta, alquiler y servicios, búsqueda, ciudad, precio, paginación.
- Anuncios con título, descripción, categoría, precio, ciudad, hasta seis fotografías mediante /api/media/upload, edición, estados, eliminación, favoritos.
- Contacto mediante el chat existente, respetando bloqueo y configuración de privacidad.
- Reportes y moderación básica para administradores desde Marketplace. Catálogo solo para usuarios autenticados.
- Controles backend: Zod, SQL parametrizado, ownership, filtrado de bloqueos, límites de peticiones.
- Sin pagos internos, comisiones ni integración de pasarelas.

## Pendiente de verificación antes de merge
- GitHub CI SUCCESS, tests existentes y test nuevo de Marketplace.
- Pruebas manuales reales con usuario y administrador en móvil.
- Moderación en profundidad, regulación de servicios/inmuebles, antiestafa y verificación de anunciantes en fases siguientes.

**No fusionar sin autorización expresa del propietario.**
