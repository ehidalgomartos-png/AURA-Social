# RedLibertad V3.0.6 — Mobile Navigation Polish

**Base:** V3.0.5 fusionada en `main`, commit `4c33fb8be30891da155525d77dd871b1031b874d` (PR #156).

## Incidencias observadas
- Los iconos de la barra inferior móvil eran caracteres tipográficos pequeños y grises (`⌂`, `⌕`, `✉`, `○`). Su grosor variaba según el sistema y no destacaban frente al botón «Crear».
- La barra flotante usaba un fondo parcialmente translúcido, dejando transparentar fotos y publicaciones por detrás.
- Al leer una publicación grande o al final del perfil, era necesario mantener suficiente espacio inferior para que los controles no la taparan.

## Corrección
- Navegación móvil con SVG inline nítidos: casa, brújula, conversación y perfil. Se mantiene el botón naranja «Crear» con símbolo más claro.
- Los iconos son decorativos con `aria-hidden=true`, conservan etiquetas textuales, estado `aria-current=page` y la insignia de mensajes sin leer.
- Barra de color crema **opaco**, borde nítido y sombra moderada: no deja ver el contenido a través de la superficie.
- Estado activo turquesa y focos de teclado de alto contraste; tamaños táctiles grandes, adaptación a pantallas estrechas, movimiento reducido.
- Padding inferior móvil y del perfil propio calculado con `--mobile-dock-space` y `safe-area-inset-bottom` para poder llegar al final de los posts sin perder contenido tras la barra.
- Se preserva el ocultamiento automático del dock cuando aparece el teclado en pantallas de chat.

## Checklist
1. Requerir Actions completas en verde. PR separado, sin fusión automática.
2. Tras autorizar merge y validar despliegue Coolify, confirmar `/api/health` versión 3.0.6.
3. En iPhone/Android comprobar Inicio, Explorar, Crear, Mensajes y Perfil; contrastes y botón activo.
4. Revisar que no se transparenta la publicación bajo la barra, y hacer scroll hasta el final de una fotografía y de una publicación de texto.
5. Probar el contador de mensajes, abrir teclado de chat, cerrar teclado y navegar de vuelta.
6. Verificar pantallas estrechas y safe-area en móviles con indicador de inicio.

## Seguridad y datos
Hotfix exclusivamente visual y de navegación: sin cambios de BD, publicaciones, fotos, permisos, mensajes o monetización. Las pruebas CI no sustituyen validación visual desde móvil.
