# V3.3.39 — Captación y SEO de contenido público

- Las páginas /p/:id muestran títulos y descripciones sociales y SEO basados en el texto real publicado y en su autor, en lugar del título genérico «Mira mi post». Los posts sin texto reciben un título claro que distingue sus enlaces.
- Las previsualizaciones de contenido sensible, cuentas no descubribles y autores administrativos no exponen textos ni nombres en metadatos, sin modificar permisos ni reglas de publicación.
- Las páginas no indexables envían también X-Robots-Tag y una política de caché privada, conservando la etiqueta HTML noindex existente.
- Las páginas públicas de publicaciones y perfiles añaden enlace directo a WhatsApp reutilizando la URL canónica (sin nuevo sistema de compartir, sesiones ni dependencias).
- Se conservan las rutas /p/:id, /perfil/:username, sus sitemaps filtrados y las verificaciones existentes de indexabilidad.
- Pruebas automatizadas para textos, Unicode, previsualizaciones privadas, enlaces, sitemaps y exclusión de contenido sensible. No se afirma que Google haya indexado las páginas hasta comprobar Search Console.
