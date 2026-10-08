# RedLibertad V2.14.0 — Centro de recuperación y dependencias

Base: \`48818eaf4b4d1900780ecb353d6cc81199b6cdce\` (V2.13.0, PR #143 fusionado).

## Mejoras implementadas
- Centro de recuperación visible en Administración, adaptado a móvil y con botón «Comprobar ahora».
- Comprobación de PostgreSQL con consulta de solo lectura, plazo de respuesta limitado y estado de saturación del pool.
- Comprobación de accesibilidad y permisos de escritura del directorio multimedia persistente, **sin crear, cambiar ni borrar archivos**.
- Si el sistema operativo lo permite, muestra espacio libre del volumen local y emite advertencias de capacidad (aviso por debajo del 10 % o 512 MB, crítico por debajo del 3 % o 128 MB).
- Estado opcional de configuración Web Push. No se presenta como avería cuando push o el almacenamiento local están deshabilitados.
- Nueva API \`GET /api/admin/ops/dependencies\` protegida por \`requireAdmin\`, con \`Cache-Control: no-store\`.
- Diagnósticos compartidos entre consultas durante 15 segundos para evitar sobrecargar recursos; pulsar «Comprobar ahora» fuerza una nueva ejecución.
- Eliminación del registro de URL completa y mensajes arbitrarios de errores API; ahora se registra únicamente el área y código de error acotado.
- Excluye los chequeos internos de dependencias de las métricas agregadas V2.13.
- Pruebas de seguridad, tiempos límite, saturación, volumen y protección de datos integradas en GitHub Actions.

## Límites conocidos
- Es una comprobación puntual desde **una instancia de Node.js**, no un sistema externo de vigilancia 24 horas ni una verificación de backups.
- Comprobar la escritura con permisos del sistema operativo no garantiza que una futura subida pueda completarse.
- «Push configurado» no equivale a comprobar una entrega real.
- Para comprobar Coolify y el estado de producción debe revisarse el despliegue y ejecutar el smoke HTTP del servidor tras la fusión autorizada.
- Ningún test de esta fase requiere alterar usuarios, publicaciones ni la BD de producción.
- No se añade monetización.

## Validación
1. Verificar Actions en el PR y dejarlo sin fusionar hasta autorización.
2. Después del merge autorizado, verificar \`/api/health\`: \`2.14.0\`, y \`/api/ready\`.
3. Revisar las variables/volúmenes de Coolify sin exponer secretos.
4. Comprobar desde móvil Centro de recuperación y botón «Comprobar ahora».
5. Probar publicaciones, chat, vídeos, Stories, PWA y administración con cuentas autorizadas.
