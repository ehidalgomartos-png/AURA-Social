# V3.4.1.4 — Corregido el hueco blanco bajo Facebook

A partir de capturas de RedLibertad en ordenador y móvil se detectó que el plugin de Facebook mostraba correctamente la publicación, pero dejaba centenares de píxeles blancos hasta el enlace al original.

- Causa: el iframe imponía alturas de 570–760 px y un mínimo CSS de 570 px independientemente del tamaño real de la publicación.
- Corrección: altura inicial compacta basada en el ancho real de Facebook (aproximadamente 1,05 × ancho) y retirada del mínimo CSS; el enlace original aparece inmediatamente después del contenido.
- Para publicaciones largas se ofrece **Ampliar publicación** y **Reducir publicación**. Esto evita volver a imponer grandes huecos a todas las publicaciones, manteniendo acceso a posts extensos.
- Se mantiene el consentimiento de carga automática por usuario/dispositivo, el IntersectionObserver, el límite de 6, la reproducción y las reglas de seguridad sin cambios. También siguen funcionando los botones de carga manual.
- Se actualiza la versión CSS y JS para renovar los recursos del navegador y se añaden pruebas sobre escritorio, móvil, ampliación y privacidad.

Los contenidos externos varían y los iframes de Facebook no permiten consultar el tamaño interno desde RedLibertad. La opción Ampliar funciona como alternativa cuando un texto largo necesite más espacio. No se alteran datos, publicaciones, notificaciones, emails ni cobros.
