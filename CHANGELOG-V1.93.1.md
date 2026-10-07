# RedLibertad V1.93.1 — Registration Rate Limit Hotfix

Hotfix de producción sobre V1.93.0.

## Problema
El registro tenía un límite único de 8 intentos por 15 minutos basado en IP. En redes móviles, NAT o proxies varios usuarios legítimos podían compartir el mismo contador.

## Solución
- límite por red ampliado a 120 solicitudes / 15 min;
- segundo límite por identidad (email + usuario) de 12 intentos / 15 min;
- identidad convertida a hash antes de usarse como clave del rate limiter;
- respuesta 429 con tiempo restante aproximado;
- mensaje de interfaz más claro;
- login conserva su protección existente;
- sin migraciones;
- sin monetización.
