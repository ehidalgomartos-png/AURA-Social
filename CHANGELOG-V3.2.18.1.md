# RedLibertad V3.2.18.1 — Hotfix publicación editorial y perfiles

Base: V3.2.18 fusionada en main, commit `c2e5668eacac2d4abbd03ceb7b72a1c9e739cc88`.

## Fallo
Una noticia aprobada aparecía como «Aprobada y apta; lista para publicar» pero al pulsar «Publicar manualmente» el servidor respondía que la categoría y el perfil no coincidían. La lista de publicación comprobaba menos condiciones que la propia ruta de publicación.

## Solución
- La cola muestra el diagnóstico por cada noticia: categoría de la noticia, perfil asignado, categoría y perfil actual de la fuente RSS.
- Deshabilita la publicación cuando hay incoherencia y muestra instrucciones para corregir la configuración en el Centro Editorial.
- Si la fuente RSS ya tiene un perfil **preparado de su misma categoría**, presenta el botón explícito «Reasignar y devolver a revisión». El servidor valida revisión y confirmación y comprueba que NO existe una publicación visible.
- La reparación únicamente afecta a la noticia elegida, conserva título/resumen, actualiza su categoría y perfil según la fuente, limpia aprobación anterior, incrementa `revision`, registra auditoría y obliga a **nueva revisión humana y nueva autorización de calidad** antes de publicar.
- No hay correcciones masivas ni automáticas.
- Las fuentes RSS solo pueden aprobarse con perfil listo y categoría coherente, para evitar que nazcan más inconsistencias.
- Control de calidad, publicación manual, límites diarios, fuentes, cuentas y multimedia siguen protegidos.

## Operaciones
Sin migraciones de datos y sin servicios de pago. Los casos existentes se corregirán únicamente si el administrador lo solicita en cada noticia. El despliegue debe validarse en Coolify y probarse manualmente antes de dar el hotfix por estable.
