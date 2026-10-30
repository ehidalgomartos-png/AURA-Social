# Resuelve V3.5.34 — Buscadores redondeados

## Cambios solicitados
Se redondean los campos de «Buscar peticiones» y «Buscar en las soluciones» y los selectores de categoría de ambos bloques. El radio interior es de 13 px; las tarjetas exteriores de búsqueda se mantienen redondeadas con 17 px.

## Experiencia móvil
Los controles de búsqueda y selección mantienen un área táctil mínima de 48 px, con fuente de 16 px en móviles para evitar zoom involuntario en iPhone. Se mantienen las flechas nativas de los selectores, el contraste y un enfoque visible para teclado, sin cambiar casillas de verificación.

## Límites
La modificación es de presentación; no se alteran las consultas, el orden, el consentimiento, el backend ni las reglas de Resuelve. Validar en GitHub Actions y PostgreSQL 18 antes de fusionar. Comprobar el despliegue y aspecto en Coolify por separado.
