# RedLibertad V3.0.2 — SEO específico de perfiles públicos

**Base estable:** V3.0.1 fusionada en `main`, commit `a9b31ed728285f79c3a341dbc5f5699f0ba18071` (PR #152).

## Problema observado
Google mostraba «NanitaES - RedLibertad» con descripción mezclada: fragmentos genéricos de libertad de expresión más textos contiguos como «Crear cuentaEntrar». El SEO público de `/perfil/:username` devolvía biografía/titular o un fallback genérico y no impedía que Google tomara texto de la zona de registro.

## Implementación
- Generación de título propio por perfil, evitando repetir usuario si coincide con su nombre. Ejemplo: `NanitaES | Perfil en RedLibertad`.
- Meta descripción legible, única y orientada al perfil: mezcla del nombre y titular/biografía cuando existen; sin inventar profesiones, ubicaciones, intereses, seguidores ni publicaciones.
- Si no hay texto del usuario, se genera una descripción útil sobre el perfil, con recuento **solo si existen publicaciones públicas**.
- Se conserva una introducción visible en perfiles sin biografía para ofrecer a Google texto relevante en el contenido, además de `<meta name="description">`.
- `data-nosnippet` en la zona de «Crear cuenta / Entrar», en el pie legal y en la barra de acceso fija: estos textos siguen presentes y funcionales para humanos.
- `<title>`, meta description, Open Graph, Twitter y texto de compartir coherentes con la descripción.
- Marcado JSON-LD Google `ProfilePage` con `mainEntity: Person`, `name`, `alternateName` y fechas de creación y actualización válidas. La imagen solo se incluye en Person si existe avatar real indexable. Se sanitiza JSON para evitar inyección de HTML.
- `rel=canonical` mantenido, y ninguna edición de tablas o datos existentes.
- Cuentas no descubribles conservan `noindex,nofollow`, no reciben marcado de perfil ni una descripción basada en su biografía.

## Consideraciones de Google
- Google puede reescribir tanto título como fragmento usando el texto de la página. Los cambios mejoran la información disponible, pero no garantizan el resultado ni un aumento de posiciones.
- El resultado de Google puede tardar días o semanas tras desplegar; desde Search Console se puede inspeccionar `/perfil/nanitaES` y solicitar indexación solo si el perfil permite ser descubierto.
- El marcado ProfilePage se podrá comprobar con Rich Results Test; la elegibilidad para resultados enriquecidos depende también de Google y su política.

## Validación
1. CI y nuevas pruebas en verde; PR sin fusionar hasta autorización expresa.
2. Tras merge y despliegue confirmado en Coolify, comprobar `/api/health` versión `3.0.2`.
3. Abrir código fuente de `https://redlibertad.com/perfil/nanitaES` y comprobar un título y descripción propios, sin «Crear cuentaEntrar».
4. Confirmar `data-nosnippet` en los CTAs y la barra, ProfilePage JSON-LD válido, OG y Twitter coherentes.
5. Probar otro perfil con biografía y otro sin ella, además de una cuenta con `discoverable=false` para verificar `noindex` y ausencia de JSON-LD.
6. En Search Console, inspeccionar la URL canónica y solicitar indexación solo de perfiles indexables. Monitorizar los fragmentos reales sin prometer resultados inmediatos.
7. Comprobar desde móvil registro, regreso al perfil, compartir, avatar y portada, sin modificaciones.

## Protección
No se modifica PostgreSQL, ningún usuario, publicación, Story, Reel, archivo multimedia ni monetización.
