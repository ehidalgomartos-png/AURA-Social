# V3.3.24.2 — Inicio de ordenador: ancho útil y tarjetas sin solapamientos

Corrección visual solicitada con capturas de Inicio (27-10-2026). En móvil ya está bien y no se cambia.

- El desplegable «Completa tu RedLibertad» deja de estar limitado a 700 px en ordenador, evitando el gran hueco vacío a su derecha.
- En escritorio ancho se aprovechan dos columnas dentro de los primeros pasos y una columna lateral de invitaciones que no se estira hasta el final del checklist.
- Se reorganizan nombres y botones «Seguir» de las recomendaciones reales en filas independientes. Nombres largos quedan contenidos sin cubrir acciones.
- Entre 761 y 1179 px se usa una columna principal para evitar comprimir la interfaz. Hasta 760 px los estilos existentes se mantienen sin cambios.
- Todo es CSS de Inicio; sin alteraciones de API, base de datos, perfiles, permisos, invitaciones, pagos o publicación automática.
- Hoja versionada e incluida en la caché PWA; pruebas de regresión de anchura, legibilidad, botones y aislamiento móvil.
