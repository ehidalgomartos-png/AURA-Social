# RedLibertad V3.1.0 — Crecimiento y comunidad: primer espacio

Base: V3.0.6 fusionada por PR #157, commit `9839ecb59b5b56147b8b7cf8d662c626719cde1d`.

## Objetivo

Durante la primera etapa de la comunidad, ayudar a cada persona a encontrar su primera comunidad sin inventar actividad ni insistir con notificaciones. Es el primer paso de V3.1 — Crecimiento y comunidad; no es una campaña de marketing ni una promesa de tracción.

## Experiencia implementada

- En Inicio, dentro de los seis pasos de activación existentes, aparece la sección **Tu primera comunidad** si el paso «Únete al menos a una comunidad» continúa pendiente.
- Presenta hasta 3 comunidades recomendadas con su nombre, privacidad (pública o requiere aprobación), descripción breve y motivo real de recomendación. Todos los textos se escapan antes de insertar HTML.
- Las propuestas proceden únicamente del endpoint autenticado y existente `/api/communities/discover?mode=recommended`; conserva exclusiones de comunidades ya unidas, de propietarios bloqueados/silenciados y de sugerencias ocultadas. No se consultan publicaciones privadas para las tarjetas.
- Abrir una tarjeta navega a Comunidades y al detalle correspondiente. **No solicita acceso, no se une por sí solo ni genera notificaciones**; la persona sigue decidiendo.
- Si la persona ya pertenece al menos a una comunidad, el panel se oculta y cancela resultados antiguos. También se manejan listas vacías, errores de red y clics no válidos.
- Sin nuevas tablas, migraciones o cambios al endpoint. Compatible con los ajustes existentes de publicación, privacidad y moderación.
- Tarjetas claras, foco accesible, acciones táctiles y una sola columna en móvil.

## Validación

1. La producción V3.0.6 no pudo verificarse desde el navegador automatizado del asistente. **No asumir despliegue estable sin ver `/api/health` y probar la interfaz**.
2. Requerir GitHub Actions en verde, PR sin fusionar hasta autorización.
3. Con una cuenta que no sigue ninguna comunidad, abrir Inicio y comprobar el bloque «Tu primera comunidad». Verificar que muestra como máximo tres comunidades y que cada una abre el detalle correcto.
4. Comprobar una comunidad pública y una privada: la privada debe mostrar «requiere aprobación» y no unirse por error.
5. Verificar que una comunidad ya unida o cuyo dueño esté bloqueado, silenciado o tenga la sugerencia oculta no aparece. Cambiar de modo de búsqueda y navegar rápido para comprobar que no llegan tarjetas antiguas.
6. Unirse de forma voluntaria a una comunidad y regresar a Inicio: el bloque inicial debe desaparecer sin modificar los otros pasos.
7. Probar en móvil 360–430 px, botones de foco, textos largos, listas vacías y fallos de red.
8. Tras fusionar, desplegar en Coolify, verificar `/api/health` versión 3.1.0 y realizar las pruebas de producción.

## Protección

Se mantiene monetización aparcada. No se tocan cuentas, seguidores, publicaciones, vídeos, mensajes ni base de datos. Copias manuales desde Coolify siguen siendo la estrategia temporal elegida por el usuario.
