# V3.4.1.5 — Abrir fotografías de publicaciones y perfiles

- **Publicaciones:** la fotografía de un post autorizado se puede pulsar para verla ampliada a pantalla completa.
- **Perfiles:** permite ampliar tanto la foto de perfil como la portada de un perfil propio o de otra persona visible.
- Se adapta a móvil y escritorio, muestra la imagen sin recortes (`object-fit: contain`) y se cierra mediante X, Escape o tocando fuera de la imagen.
- Accesible mediante teclado (Tab, Enter y Espacio), con etiqueta descriptiva y recuperación del foco.
- El visor reutiliza exclusivamente las imágenes ya visibles y autorizadas en la página. No ofrece fotografías bloqueadas por consentimiento ni recupera direcciones privadas, y no añade rutas ni llamadas adicionales al servidor.
- Se conserva el clic sobre el avatar de una publicación para visitar el perfil y el visor de imágenes de mensajes privados ya existente.
- El script propio se incluye en el precache PWA y se actualizan las versiones de CSS/JS para evitar caché antigua.
- Pruebas de interacción, accesibilidad, seguridad de URLs, filtros y diseño.

**Nota:** la primera captura recibida también muestra un reproductor de Facebook que no ha cargado. Ese caso es externo al visor de fotografías de RedLibertad y requiere diagnóstico separado de la inserción del proveedor.

Sin migraciones PostgreSQL, cambios de permisos, publicaciones, datos personales, envío de correos ni monetización.
