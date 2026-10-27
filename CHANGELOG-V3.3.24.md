# V3.3.24 — Consolidación de las métricas reales y estabilidad del panel

## Objetivo
Cerrar la fase de crecimiento sin añadir pantallas nuevas, usuarios ficticios, publicaciones ni acciones automáticas. Fiabilidad del único Centro de crecimiento existente.

## Cambios
- El Centro de crecimiento muestra, bajo Primeros 7 días, Actividad D1 y Actividad D7, el número de cuentas activas y el total elegible. Con menos de 10 cuentas elegibles añade «muestra pequeña», y con 0 muestra «Sin muestra elegible». Las tasas originales continúan sin alteraciones.
- Al cambiar rápido entre 7, 30 y 90 días, una respuesta antigua o fallida no puede sobrescribir una consulta más reciente del administrador.
- El endpoint de métricas devuelve la fecha de cálculo `generatedAt`. El servidor reutiliza los resultados durante 60 segundos, sin falsificar fechas de consulta en caché. La fecha aparece en las notas metodológicas ya existentes.
- Se aclara que la tendencia de altas dibuja hasta 30 días con registros, incluso si se ha elegido una ventana mayor.
- Misma interfaz y permisos, sin nuevos datos personales, nuevos endpoints, cookies, píxeles, cambios PostgreSQL, mensajes privados, notificaciones ni monetización.
- CSS compacto y cache bust de admin.js y admin.css.

## Validación
Pruebas de concurrencia de periodos, error antiguo, denominadores D1/D7, muestra pequeña, control administrativo, privacidad, caché y diseño actual. Ejecución completa de JavaScript y PostgreSQL 18 antes de fusionar, verificación posterior del commit en main y despliegue Coolify por separado.
