# V3.3.14 — Explorar escritorio: personas primero, tarjetas claras

## Capturas y causa
Las capturas confirman que el Inicio ya no tiene solapamientos, pero en Explorar escritorio el gran bloque azul «Tus conexiones» aparece antes que Personas. Sus tarjetas tienen acciones diminutas y «Ver perfil» salta de línea.

## Modificaciones
- En escritorio (>760 px), la búsqueda general permanece arriba, **Personas pasa delante de Conexiones**, y contenidos, Noticias y Marketplace siguen disponibles.
- «Tus conexiones» pasa a ser una tarjeta clara y compacta, con número, acceso al Centro y botón **Ver conexiones**. La lista y los filtros siguen disponibles al desplegarla; gestionar círculos sigue operando con los mismos controles.
- Las sugerencias de personas usan una fila de avatar/datos y otra independiente para **Ver perfil, Seguir y Ocultar**, con zonas pulsables de al menos 38 px. Tres columnas anchas, dos columnas intermedias y una en pantallas pequeñas de escritorio.
- Reduce el tamaño del título de Explorar y los márgenes sobrantes.
- Cambia la URL de CSS para actualizar caché del navegador y PWA.

Sin nuevas rutas, peticiones, datos, algoritmos de sugerencias, usuarios sintéticos, actividad simulada, monetización ni cambios de privacidad. Las reglas móviles hasta 760 px no se tocan.

## Validación
Tests estructurales y de render del HTML generado; pruebas generales y PostgreSQL 18 antes y después de fusionar. La inspección en navegador real requiere posterior comprobación; no se confunde fusión con despliegue de Coolify.
