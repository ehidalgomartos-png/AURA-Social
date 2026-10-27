# V3.3.12 — Explorar móvil: cargar únicamente la sección visible

## Objetivo
Tras compactar Explorar (V3.3.11), se observa que la entrada a Explorar aún solicita personas, círculos, tendencias y publicaciones al mismo tiempo, aunque en móvil solo hay una pestaña visible.

## Cambios
- Al entrar en Explorar desde un móvil (media query de 760 px), se solicitan solo los datos de Publicaciones o Personas, según la pestaña elegida.
- Al pasar a la otra pestaña, se solicitan sus datos bajo demanda; la respuesta reutiliza los mismos endpoints y controles de privacidad de siempre.
- Durante la misma visita, navegar varias veces entre pestañas no dispara solicitudes duplicadas; cada nueva entrada a Explorar actualiza la pestaña seleccionada.
- Si una petición rechaza, el bloqueo de esa pestaña no se conserva y puede reintentarse.
- En escritorio se mantienen las cuatro cargas originales, sin modificar el diseño.
- Se mantienen filtros, búsquedas directas, páginas, notificaciones, permisos y funcionamiento de la PWA.

**Sin migraciones, publicaciones ficticias, métricas nuevas ni monetización.** Requiere GitHub Actions (suite completa) y PostgreSQL 18 antes/después de fusionar. Despliegue Coolify se comprueba aparte.
