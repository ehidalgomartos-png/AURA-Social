# V3.3.13.1 — Tarjetas de «Descubre personas» en ordenador

## Problema detectado
Captura real: en Inicio de escritorio, al mostrar tres sugerencias en un ancho reducido, el botón «Seguir» invade el nombre largo de un usuario. En móvil las dos tarjetas visibles funcionan correctamente.

## Corrección
- Solo a partir de 761 px, cada tarjeta reserva filas independientes para el nombre, la descripción y el botón «Seguir»; el avatar ocupa la columna izquierda.
- Nombres largos pueden ocupar dos líneas y respetan el ancho disponible; el texto secundario se recorta con puntos suspensivos, sin montarse sobre los controles.
- La disposición de dos perfiles por columna y el desplazamiento horizontal para teléfonos (hasta 760 px) no cambian.
- Se incrementa la versión de `social.css` en la URL de `public/app.html` para renovar caché de navegador/PWA.
- Se mantiene el enlace al perfil, seguimiento real, privacidad, recomendaciones actuales y ausencia de actividad artificial.

## Validación
Pruebas específicas de CSS, estructura, enlaces existentes y regresión móvil. GitHub Actions completo y PostgreSQL 18 deben terminar satisfactoriamente antes de fusionar. El despliegue en Coolify debe comprobarse por separado.
