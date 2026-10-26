# V3.3.10 — Inicio móvil con actualizaciones coherentes

El inicio ya evita cargas duplicadas (V3.3.8); sin embargo, las llamadas que se lanzan por otras acciones, como actualizar con un gesto o seguir a alguien, todavía podían terminar fuera de orden. Una respuesta de «Desde tu última visita» podía actualizar la fecha incluso después de abandonar Inicio.

- Los resúmenes de actividad solo se actualizan con la respuesta vigente mientras Inicio está abierto. Una respuesta tardía desde otra sección **no marca una visita**, por lo que no hace desaparecer novedades no vistas.
- Las personas activas, las recomendaciones y las comunidades sugeridas ignoran respuestas antiguas en caso de llamadas simultáneas.
- Los fallos temporales de recomendaciones o comunidades preservan el contenido cargado anteriormente. Un fallo de red deja de confundirse con «Ya conoces a todos».
- Se mantienen las actualizaciones intencionadas después de una publicación o al seguir a una persona. Sin caché nuevo, almacenamiento adicional, datos ficticios ni pantallas duplicadas.
- Pruebas de respuestas desordenadas, cambios de sección, fallos y conservación de fecha de visita.

Se requiere GitHub Actions y PostgreSQL 18 correctos; Coolify se valida por separado.
