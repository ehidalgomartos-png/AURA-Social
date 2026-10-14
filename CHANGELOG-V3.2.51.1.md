# RedLibertad V3.2.51.1 — Marketplace Save Hotfix

Base estable: V3.2.51 (PR #222 fusionado en `main`, commit `d48f31bfdc7f84963f4d27f3212271298cee7248`).

## Incidencia

En el cuadro **Publicar anuncio** se puede rellenar el título, descripción, categoría, ubicación, precio y fotografías, pero el usuario informa de que el botón **Guardar anuncio** no responde. Aún no hay registro del error concreto del navegador o del servidor; no se asume una causa única.

## Solución

- El envío usa validación explícita y accesible en lugar de depender de los avisos nativos del navegador dentro del modal.
- Admite precios escritos como `15,99` o `15.99`, y convierte a céntimos enteros para PostgreSQL.
- Errores descriptivos de campos y fotografía JPG/PNG/WebP, tamaño, sesión y red.
- Muestra estado **Subiendo foto X de N… / Publicando anuncio…**; previene envíos repetidos.
- Conserva los campos y las fotos que ya se hayan subido cuando la API de Marketplace rechaza el anuncio.
- Si la operación tarda demasiado, advierte al usuario que consulte «Mis anuncios» antes de reintentar para no crear duplicados.
- Nueva caché de JS `?v=3.2.51.1`, sin alterar las rutas del catálogo, datos existentes ni el SEO de V3.2.51.
- Pruebas de validación y regresión específicas.

## Validación antes de fusionar

1. GitHub Actions debe terminar en **SUCCESS**.
2. Fusionar **solo con autorización expresa del usuario**.
3. Tras despliegue, comprobar `/api/health` versión `3.2.51.1`.
4. Abrir Marketplace, pegar título y descripción, categoría, ubicación, precio 15,99 € y subir una fotografía JPG/JPEG.
5. Pulsar Guardar y comprobar la transición a **Mis anuncios**, fotografía, URL pública SEO y sitemap.
6. Si el servidor sigue fallando, anotar literalmente el mensaje visible y revisar Coolify/PostgreSQL sin volver a enviar la publicación a ciegas.
