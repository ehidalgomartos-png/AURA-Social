# RedLibertad V3.2.9 — RSS DNS lookup compatibility hotfix

Base estable: V3.2.8, PR #167, commit 655a0d6571a1a7624b30061e8315e4c9de45392f.

## Problema reproducido

- Un administrador confirmó que `https.get('https://feeds.elpais.com/...')` devuelve `HTTP 200` desde el mismo contenedor Coolify.
- Una prueba con una conexión HTTPS fijada a la IP pública DNS `199.232.194.133` devolvió `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined`.
- La causa es el callback `lookup` personalizado: respondía siempre `callback(null,address,family)`, aunque Node.js invoca `lookup(...,{all:true},...)` al activar autoSelectFamily y exige `callback(null,[{address,family}])`. Node trata incorrectamente la respuesta de tres argumentos como lista y falla antes de conectar al origen.

## Corrección

- `pinnedAddressLookup` devuelve una lista de una sola IP validada si `options.all===true`, o la dirección y familia individuales cuando se solicita el contrato normal.
- La dirección IP continúa previamente validada con protección SSRF, pinning efectivo, comprobación TLS/SNI por nombre, bloqueo de redirect y límites de tiempo/tamaño.
- No se desactiva `autoSelectFamily`, la verificación de certificados ni ningún control de red.
- Test unitario para ambos contratos IPv4/IPv6 y test de integración con socket Node real usando `autoSelectFamily:true` sin acceso a Internet.
- Versión `3.2.9`; CI de todas las regresiones existentes, sin migración PostgreSQL ni alteración de datos.

## Pasos de validación

1. Confirmar CI verde y fusionar solo bajo autorización del propietario.
2. Desplegar `main` en Coolify y comprobar `/api/health` con `version:"3.2.9"`.
3. En Centro Editorial, mantener la fuente aprobada «El País» sin recrearla; pulsar «Consultar RSS».
4. Esperado: noticia(s) candidata(s), aunque puede aparecer otro rechazo del proveedor o formato que ahora será diagnosticable.
5. Comprobar que ninguna noticia se publica sin revisión/confirmación humana.
6. Si el error cambia, adjuntar el nuevo mensaje y evaluar por separado su causa.
