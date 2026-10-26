# V3.3.8 — Navegación móvil sin solicitudes duplicadas de Inicio

## Problema
Tras V3.3.7, la carga diferida del arranque puede coincidir con una vuelta manual a Inicio. Cada llamada al coordinador podía lanzar otra vez las cuatro cargas del resumen, aunque la anterior todavía estuviera trabajando.

## Cambios
- Se reutiliza la misma petición **solo mientras está en curso** para los paneles ya existentes: resumen de regreso, actividad destacada, crecimiento y comunidades.
- Las peticiones se liberan tanto al resolverse como al fallar. Una nueva visita posterior sigue consultando datos frescos: no se guardan resultados ni se usan TTL que puedan ocultar actividad reciente.
- Los accesos directos a otras vistas continúan evitando peticiones exclusivas de Inicio.
- Se preserva la carga inicial de recomendaciones, las acciones y los refrescos expresos, así como los controles de sesión, privacidad y PWA.

## Validación
Pruebas de concurrencia, fallo temporal, retorno al feed, rutas directas y renovación posterior, además de la batería completa de GitHub Actions y PostgreSQL 18.

No hay migraciones, monetización, actividades ficticias ni nuevas pantallas.
