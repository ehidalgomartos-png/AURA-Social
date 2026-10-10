# RedLibertad V3.2.24 — Inicio Limpio 2.0 + noticias intercaladas

**Base estable:** V3.2.23 (`2e9c3a7ac3df095b6683c2293c91700b5a472693`).

## Inicio social, centrado en las personas
- Las publicaciones reales aparecen inmediatamente después de Stories, compositor y una pequeña barra plegable de primeros pasos.
- El panel grande de bienvenida, personas de interés, comunidades iniciales e invitaciones **sigue disponible**, pero plegado en `details`; ninguna herramienta se elimina.
- Los paneles «Desde tu última visita / Destacados de hoy», actividad de comunidades y otras señales pasan **después del feed**: no bloquean la lectura de publicaciones.
- Si no hay publicaciones destacadas ni personas con actividad reciente, el bloque de Destacados de hoy desaparece en lugar de mostrar un estado vacío.
- Stories y compositor compactados en pantalla pequeña.

## Noticias dentro del propio feed
- Se elimina visualmente el gran panel independiente «Noticias para conversar».
- Se muestran tarjetas con identidad **editorial verificada**, atribución del medio, titular, resumen breve, fotografía local autorizada (si la tiene), cifras auténticas de Me gusta y comentarios, y un enlace a la noticia completa para interactuar.
- Orden: **dos publicaciones sociales originales, una noticia**, repetido hasta un **máximo de tres noticias** y solo cuando existan suficientes publicaciones reales.
- Para ti y Nuevo admiten recomendaciones editoriales; **Siguiendo, Cercanas y VIP no se mezclan**, para respetar sus audiencias y preferencias.
- No se inventan ni alteran posts, no se repiten noticias en la sesión, no se insertan dos noticias seguidas y, si faltan noticias, el feed funciona como antes.
- La API existente solo entrega noticias ya **publicadas, visibles y vinculadas a perfiles editoriales preparados**.
- Después de volver a cargar las publicaciones el mezclador se ejecuta otra vez, sin cambiar la lógica original de likes, comentarios, privacidad y filtros de las publicaciones personales.

## Seguridad, privacidad y comportamiento
- Noticias proceden de `GET /api/editorial-social/discover` y se enlazan únicamente a `/noticias/p/:id`, sin simular autores humanos ni autopublicar.
- Fotografías de noticias solo se muestran si son archivos locales `/uploads/editorial/` autorizados; las URLs de fotos de medios externos no se incrustan.
- `sessionStorage` solo conserva los ID de noticias editoriales vistas en la sesión para evitar repeticiones; no guarda nombres de usuarios ni información sensible.
- Nuevas pruebas para orden 2:1, privacidad de modos, deduplicación, estados vacíos, posición de secciones y versión.

## Validación visual tras despliegue
1. Abrir `/api/health` y confirmar `version: "3.2.24"`.
2. Entrar con una cuenta normal en Inicio: Stories y compositor, barra pequeña y primeras publicaciones deben ser visibles inmediatamente.
3. Comprobar con al menos **dos publicaciones auténticas y una noticia pública revisada**: aparece una tarjeta de noticia después de las dos publicaciones.
4. Cambiar a Siguiendo, Cercanas y VIP: no deben aparecer noticias añadidas.
5. Actualizar feed y verificar que no se repiten noticias de la misma sesión. Comprobar móvil/escritorio.
6. Expandir la barra de bienvenida y navegar a las herramientas anteriores (invitaciones, primeros pasos, sugerencias de personas y comunidades); las funciones permanecen intactas.
