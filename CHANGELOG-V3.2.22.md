# RedLibertad V3.2.22 — Imágenes Editoriales de RSS

**Base estable:** V3.2.21 (`d527aba696d8538d1174816a3408a1cd858d0669`).

## Funcionalidad
- Al consultar manualmente un RSS/Atom, se detecta **solo la URL** de la fotografía proporcionada en `media:content`, `media:thumbnail`, `enclosure` o enlace de tipo imagen. No se descarga ni publica automáticamente.
- En **Centro Editorial → Revisión de noticias**, aparece «Fotografía de la noticia RSS» cuando existe una sugerencia. La **previsualización privada** se solicita expresamente a través de un endpoint administrativo seguro.
- Solo se permite elegir una fotografía si la fuente está `approved`, tiene `rights_mode=licensed` y una referencia de licencia documentada; además, el administrador debe identificar el autor/crédito, describir la imagen, registrar el **permiso de esa fotografía concreta** y confirmarlo expresamente.
- La importación valida HTTPS, DNS público, TLS, rechaza redirecciones y URLs privadas, limita a 4 MB y solo acepta **JPEG, PNG o WebP** con firma compatible. No se admiten SVG, HTML, vídeos ni descargas automáticas.
- Las imágenes autorizadas se guardan en `UPLOAD_DIR/editorial/` en el **almacenamiento local persistente del VPS**; ningún periódico externo se enlaza directamente en páginas públicas.
- Al seleccionar imagen, la noticia vuelve a `pending`, limpia la aprobación anterior, aumenta `revision` e invalida el control de calidad. Requiere nueva revisión y publicación manual separada.
- Las publicaciones guardan una **instantánea propia** de ruta local, texto alternativo, crédito y justificante de derechos. El sistema verifica los derechos también al publicar o republicar.
- Muestra foto y crédito en **tarjetas de /noticias**, **artículos públicos** y **inicio social editorial**, en diseño mobile-first. Si no hay foto autorizada se mantiene la presentación actual.
- El registro `editorial_audit` conserva el administrador, justificante y fuente. Los cambios no alteran fotos antiguas, publicaciones previas ni permisos de usuarios.

## Límites conscientes
- Las fotografías de RSS no son automáticamente reutilizables: solo se usan con permiso específico. La licencia del texto RSS no necesariamente cubre fotos de agencias o terceros.
- Las noticias ya importadas no recuperan automáticamente fotos históricas. Se detectan las fotos en futuras consultas RSS.
- Fotos mayores de 4 MB, SVG, dominios no seguros o metadatos no soportados quedan sin imagen; las noticias siguen intactas.
- La previsualización hace una conexión HTTPS limitada **solo al pulsar** el administrador. Ninguna descarga se inicia por un feed ni por visitas del público.
- No incluye subida manual de fotografías propias (se podrá implementar en una fase posterior).
- Sin IA de pago, sin publicaciones automáticas ni cambios en cuentas sociales. Almacenamiento `UPLOAD_DIR` debe ser persistente en Coolify.

## Verificación de despliegue
- Tras fusionar y desplegar, comprobar `/api/health` → `3.2.22`.
- Consultar una fuente RSS autorizada que exponga `media:content`, `media:thumbnail` o `enclosure`.
- Revisar que la foto aparece **solo como sugerencia privada**.
- Con licencia documentada para esa foto concreta, seleccionarla, revisar el nuevo estado Pendientes y repetir aprobación/calidad.
- Publicar manualmente y comprobar fotografía, descripción, crédito y que `src` empieza por `/uploads/editorial/`.
