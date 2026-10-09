# RedLibertad V3.2.1 — RSS manual y bandeja de revisión

Base: V3.2.0 fusionada, PR #159, commit f3ac44feddd842f75950583ec1e740178b322b51.

## Funciones
- Botón «Consultar RSS» exclusivamente para fuentes marcadas como **aprobadas** en Centro Editorial.
- RSS 2.0 / Atom; hasta 20 noticias recientes por consulta, sin descargar artículos ni imágenes.
- Clasificación inicial por categoría de la fuente, título y extracto de referencia (no se presenta como resumen original ni se publica).
- Normalización de enlaces, eliminación de parámetros de rastreo comunes, índice único de URL y huella del titular por categoría.
- Noticias almacenadas en editorial_candidates como **pendientes**, con fuente enlazada para revisión manual posterior.
- Bandeja de pendientes en Administración; histórico de consultas en editorial_audit.
- Cooldown por fuente de 5 minutos y bloqueo de consultas simultáneas por PostgreSQL.
- Sin cron ni programación, sin perfiles reales, sin posts públicos ni publicaciones en comunidades, sin uso de IA externa.

## Límites y seguridad
- Solo fuentes HTTPS; sin redirecciones, credenciales, puertos alternativos o URLs IP literal.
- Resolución DNS IPv4 pública fijada a la conexión TLS para evitar DNS rebinding; las fuentes exclusivamente IPv6 no funcionan todavía.
- Denegación de rangos privados, de enlaces locales y reservados, incluida dirección metadata cloud.
- Respuesta XML máximo 768 KiB, límite de espera 8,5 segundos, solo contenido XML/RSS/Atom.
- Rechazo de DTD/DOCTYPE y declaraciones ENTITY. Parser fast-xml-parser 5.11.2 con entidades no procesadas.
- Nunca se visita la URL de un artículo ni se descargan imágenes externas; solo se leen sus metadatos RSS.
- Noticias pendientes requieren verificación humana: no es un detector infalible de noticias falsas.

## Precauciones antes de fusionar
1. Confirmar GitHub Actions en verde (incluido test:editorial-rss) y /api/health versión 3.2.1.
2. Verificar prueba del panel con un feed autorizado HTTPS, en copia de pruebas.
3. Confirmar que 2 consultas iguales solo generan un candidato por URL/titular, y el cooldown.
4. Confirmar que un usuario sin rol admin no puede consultar ni listar noticias.
5. Confirmar que un RSS con redirect, red privada, tamaño excesivo y XML DTD se bloquea.
6. Probar perfiles normales, publicaciones y multimedia persistente después del despliegue.
7. Mantener copias manuales de PostgreSQL y del volumen del VPS antes de desplegar.

## V3.2.2
Edición humana de titular/resumen originales y aprobación/rechazo de candidatos, conservando la atribución. Ningún candidato se convierte en publicación en V3.2.1.
