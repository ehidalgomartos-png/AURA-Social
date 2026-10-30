# Resuelve V3.5.20 — Bandeja de trabajo para administración

## Qué cambia
En `/resuelve/admin` se añade un resumen de trabajo que conduce a las dos colas: **soluciones pendientes de revisión** y **avisos pendientes**. El botón «Actualizar bandeja» refresca ambas colas manualmente.

La cifra de cada tarjeta muestra **solo las entradas cargadas** en el navegador, nunca se presenta como el total del servidor. Si la API indica que hay otra página, se muestra «+» y se explica que podrían existir más pendientes. Un error de carga aparece como «Error», no como 0. La administración puede seguir cargando más elementos mediante los botones de cada cola.

## Moderación segura
- Aprobar una solución exige las tres comprobaciones manuales de calidad, privacidad y ausencia de publicidad encubierta; se pide confirmación.
- Desestimar un aviso u ocultar una respuesta exige confirmación y bloqueo de los dos botones de esa tarjeta mientras se procesa la operación. Los botones vuelven a habilitarse si falla.
- Tras una acción correcta se actualiza el resumen de entradas cargadas. La ocultación actualiza también la cola de avisos y las métricas reales.
- No se añade clasificación comercial, perfiles virtuales, automatización de sanciones, ni nuevas colecciones de datos personales.
- Se conserva la URL protegida por servidor y la separación entre la página pública y la administración.

## Despliegue
Validar tests del cambio, regresiones de V3.5.19 y suite completa de GitHub Actions, incluida PostgreSQL 18, antes de fusionar. Verificar después el despliegue de Coolify: GitHub no prueba que ya esté en producción.
