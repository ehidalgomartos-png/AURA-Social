# RedLibertad V3.2.7.1 — RSS Connectivity Diagnostic Hotfix

Base estable: V3.2.7, PR #166, commit d0fa7256fd245759c4e7ffc45148b7637f74f645.

## Problema reportado
Al pulsar «Consultar RSS» en una fuente aprobada de Tecnología de EL PAÍS, el panel muestra `feed_network_error` y «Última consulta: –». No hay confirmación de la URL RSS exacta almacenada ni del motivo específico (DNS, red, TLS, bloqueo remoto), por lo que no se puede asumir que el fallo dependa del propio feed.

## Cambios
- El importador distingue las respuestas administrativas: DNS, transporte/conexión, certificado/TLS, timeout y descarga interrumpida.
- Resuelve A y AAAA mediante DNS del VPS y prueba hasta dos direcciones públicas por familia con IP de destino fijada a la conexión TCP. IPv4 va primero y IPv6 puede servir de alternativa si falla.
- **No** conecta a direcciones privadas, de enlace local, loopback, IPv4 mapped, IPv6 de túnel, multicast o rangos reservados conocidos. Si hay un resultado DNS mixto público/privado, se bloquea todo.
- Preserva validación HTTPS/TLS del nombre del host y certificado; no sigue redirecciones y no permite puertos alternativos ni enlaces IP.
- Espera total acotada (hasta 14 s después de DNS), 5,5 s máximo por intento, RSS XML de hasta 768 KiB y 20 candidatos como en la versión anterior.
- Panel administrativo muestra orientación según código sin divulgar direcciones internas, certificados ni detalles de red a clientes.
- Sin cambios en PostgreSQL ni datos editoriales; ningún cron, publicación automática, cuenta ficticia o interacción simulada.

## Comprobación en Coolify
1. Verificar backup manual de PostgreSQL y medios persistentes antes de desplegar.
2. Desplegar el commit de este hotfix una vez fusionado y comprobar `/api/health` con `version:3.2.7.1`.
3. En Administración → Centro Editorial, abrir «Editar» de la fuente y confirmar que `URL RSS` es un enlace real al XML, no la portada del medio.
4. Pulsar «Consultar RSS» una vez. Si aparece diagnóstico específico:
   - `feed_dns_error`: falla resolución DNS del VPS/contenedor.
   - `feed_connect_error` / `feed_timeout`: no conecta, salida 443 restringida o servidor lento/no disponible.
   - `feed_tls_error`: certificado/cadena TLS, reloj del VPS o incompatibilidad HTTPS.
   - `feed_redirect_blocked`: comprobar en navegador y sustituir por URL final HTTPS válida; nunca seguir redirecciones automáticas sin controles.
   - `feed_http_error`: acceso negado o error del proveedor. No eludir bloqueos del sitio.
5. Si sigue fallando, adjuntar captura del mensaje nuevo y la URL RSS **sin secretos** para investigación dirigida.
6. Probar importación de otra fuente RSS autorizada; si falla en todas, revisar red/DNS del VPS. Si solo falla en un medio, revisar esa URL y políticas del proveedor.
7. Confirmar que RSS no genera publicaciones sin revisión humana y que siguen funcionando chats, perfiles y multimedia.

## Validación técnica
Tests `test:editorial-rss`: IPv4, IPv6 público, bloqueo mixto público/privado, recuperación IPv6 después de fallo IPv4, diagnóstico TLS/DNS, SSRF, redirecciones, límites y regresiones previas.
