# Resuelve V3.5.32 — Compartir preguntas y soluciones con confianza

## Compartir preguntas sin exponerse a buscadores
El botón «Enviar esta pregunta» utiliza la nueva URL `/resuelve/pregunta/:id`, que muestra una previsualización adecuada en WhatsApp, Telegram, Facebook y correo. Esta página funciona sin iniciar sesión y **siempre lleva noindex,follow**. Solo muestra el título público de la pregunta y una invitación a ayudar: **no incluye el cuerpo, respuestas, teléfonos ni datos personales**.

El servidor comprueba que la pregunta existe, no está oculta y quien la publicó tiene una cuenta activa. Si está eliminada, oculta o el usuario ha dejado de estar activo, la página responde 404/noindex. La página usa `Cache-Control: no-store`, y los títulos de usuario se escapan antes de insertarse en HTML.

## Compartir soluciones: solo lo permitido
En las tarjetas de la biblioteca de soluciones aparece «Compartir solución revisada» únicamente si `seo_public_opt_in=true` para una solución ya aceptada y aprobada editorialmente. El enlace apunta a la página SEO pública, que vuelve a verificar el permiso y el estado en cada visita. Se ofrecen WhatsApp, Facebook, Telegram, correo y copiar enlace.

**Nunca se comparte ni publica automáticamente** al pulsar una tarjeta, ni se envía una notificación o mensaje a terceros sin la acción expresa de la persona que comparte.

## Principios
- Compartir una pregunta no implica aceptar indexación en Google.
- Compartir una solución no elimina su carácter voluntario: la revocación deja la página no disponible.
- Ningún enlace publica productos o servicios en nombre de las personas.
- No se añade publicidad ni contenido artificial para aparentar actividad.

## Validación
Ejecutar tests de canales, privacidad del HTML, revocación de permisos y experiencia en móvil. No fusionar sin GitHub Actions y PostgreSQL 18 correctos. La verificación del despliegue de Coolify es independiente.
