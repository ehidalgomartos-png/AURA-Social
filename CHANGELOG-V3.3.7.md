# V3.3.7 — Inicio móvil: render prioritario y carga secundaria diferida

## Qué mejora
La carga inicial de la app lanzaba simultáneamente diez procesos, entre ellos feed, Stories, buzón, notificaciones y distintos paneles secundarios de Inicio. Estos procesos competían por red y CPU con el contenido que el usuario quiere ver primero.

- Después de comprobar sesión y permisos se espera primero a los datos visibles del feed y Stories.
- Se inicia la presencia/actualización en tiempo real y se atienden enlaces directos antes de programar las cargas secundarias.
- Los paneles de resumen, descubrimiento y comunidades de Inicio se solicitan en tiempo ocioso del navegador (máximo 1,2 segundos de espera) o en el siguiente turno como fallback.
- Si se llega a otra sección mediante un enlace directo, las secciones exclusivas de Inicio no se cargan hasta volver allí.
- Los mensajes y notificaciones mantienen sus cargas existentes, evitando precargarlas si ya se está entrando directamente en su vista.
- No se modifica la forma de consultar datos, las reglas de visibilidad, los permisos, las notificaciones push ni la experiencia móvil existente. No se crean llamadas de seguimiento ni registros nuevos.
- Pruebas de prioridad de carga, fallback sin requestIdleCallback, enlaces directos y ausencia de duplicaciones.

**Precisión:** reduce competencia por recursos durante el arranque; una mejora de tiempo real debe medirse en dispositivos y redes de producción. La versión no incluye benchmarks sintéticos presentados como tiempos reales.
