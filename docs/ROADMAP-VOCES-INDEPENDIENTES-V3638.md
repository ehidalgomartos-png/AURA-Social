# RedLibertad — Voces Independientes
## Plan de producto y entregas a partir de V3.6.38

Estado: **proyecto en preparación**. En esta versión únicamente se presenta una página informativa con acceso desde Noticias. No se aceptan artículos de usuarios, votos, puntos, propinas, transferencias ni nuevas altas específicas.

### Propósito
Ofrecer un espacio diferenciable de la importación editorial existente y de Resuelve donde una persona pueda escribir investigaciones locales, explicaciones útiles, análisis y opiniones originales. El valor es informar y conversar; no publicar titulares para generar premios económicos.

### Reglas de diseño
- Mobile-first, sin recargar el Inicio general de RedLibertad.
- Una sola cuenta compartida de RedLibertad, registro 18+ y consentimiento específico para visibilidad pública de perfil de autor.
- Diferenciar **Noticia/Información** (hechos con fuentes), **Reportaje**, **Análisis** y **Opinión** (interpretación identificada); nunca presentar opiniones como información verificada.
- Fuentes enlazadas y fecha de hechos; no copiar artículos completos ni subir fotografías sin permisos.
- No equiparar revisión editorial a garantía de verdad. Exigir mecanismos de rectificación, denuncias y apelaciones, y avisos visibles de correcciones.
- Política coherente de moderación frente a spam, suplantación, difamación, acoso, información personal de terceros y contenido ilícito.
- Contadores derivados de registros reales; sin bots, reseñas ficticias, popularidad fabricada ni compra de puntos.
- Puntuaciones y propinas nunca condicionan qué información se declara verificada ni el orden editorial de noticias.

### Roadmap propuesto
**V3.6.38 — Concepto público separado de Noticias (implementado en rama).**
URL `/noticias/redactores`, acceso contextual en Noticias, etiqueta explícita de proyecto en preparación y noindex hasta existir contenido real. Sin rutas de escritura ni tablas financieras.

**V3.6.39 — Borradores privados y editor propio.**
Tablas separadas de `editorial_publications`: `independent_articles` y `independent_article_sources` con `author_user_id`, tipo, título, cuerpo, fuentes, estado, consentimiento, versiones y auditoría. API autenticada con antifraude/rate limits, validación Zod, CSRF/origen, autoría y límites de longitud. Guardar borradores, editar, previsualizar y enviarlos a revisión; solo visibles a su autor y al administrador.

**V3.6.40 — Revisión humana y trazabilidad.**
Bandeja administrativa con aceptar, devolver para corrección, rechazar motivadamente, publicar o retirar. Historial de decisiones, denuncias y rectificaciones. Prohibir que una publicación salte de borrador a visible sin acción administrativa y validación de fuentes/derechos. Pruebas reales de PostgreSQL 18 y roles.

**V3.6.41 — Lectura pública y perfiles de autor.**
Rutas públicas específicas `/noticias/voces/...` con permalink, autor claramente identificado o seudónimo elegido, tipo de texto y etiqueta de revisión, fuentes y última actualización. Solo artículos autorizados en sitemap/index. Privados, pendientes y retirados con noindex. Enlaces internos desde Noticias sin confundir con las fuentes externas del Centro Editorial.

**V3.6.42 — Reconocimiento comunitario no monetario.**
Un reconocimiento por artículo y cuenta real; sin autopuntuación, anonimato artificial, cambio ilimitado ni saldo monetario. Primero botón «Me ha resultado útil», recuentos reales, posibilidad de retirar el apoyo y mitigación de cuentas falsas. No convertir los apoyos en dinero ni comerciar con ellos. Se pueden evaluar criterios de calidad adicionales sin dar por cierta una noticia gracias a sus votos.

**V3.6.43 — Calidad, descubrimiento y moderación avanzada.**
Perfiles de colaboradores con historial público real, correcciones, fuentes, denuncias, moderación de comentarios y tasas de lectura agregadas respetuosas con la privacidad. Probar búsqueda por categoría y región, equilibrio móvil/escritorio, accesibilidad, SEO, abuso de apoyo y moderación con casos adversarios.

**V3.7.0 — Propinas en Stripe TEST, sin dinero real.**
Explorar el modelo con Stripe Connect, onboarding y verificación de beneficiarios, reglas transparentes de comisiones y reembolsos, impuestos, justificantes, conciliación de pagos, disputas y consentimiento. Verificar los requisitos legales y fiscales aplicables en España (incluida posible obligación DAC7 caso a caso); no asumir que toda propina tiene el mismo tratamiento. Nunca almacenar tarjetas ni mover fondos internamente. Validar el caso de uso con proveedor antes de activarlo; ninguna transferencia en producción sin autorización expresa.

### Criterios de activación futura
1. Autores reales completan borradores y superan una revisión.
2. Lectores encuentran utilidad, no solo clics.
3. Funciona la moderación de contenido, denuncias y correcciones.
4. No se han detectado problemas graves de plagio, privacidad, fraude ni tráfico artificial.
5. Las condiciones económicas, legales, de privacidad y de pagos quedan aprobadas antes de cobrar o transferir.

### Separación técnica
- `/noticias`: centro editorial existente de fuentes importadas y revisadas.
- `/noticias/redactores`: página del nuevo proyecto (sin formulario en V3.6.38).
- `/noticias/voces/...`: futura publicación independiente, **no implementada todavía**.
- `/resuelve`: ayuda entre personas, sin incentivos comerciales en sus respuestas.
- El sistema Stripe de Marketplace permanece en TEST; no reutilizar claves/precios de suscripciones como mecanismo de propinas.

### Comunicación honesta
Evitar «Sé redactor ya» mientras no se puedan aceptar textos. Preferir «Conoce el proyecto», «En preparación». No mostrar cifras, autores, premios ni ingresos simulados. No indexar landing de producto incompleto.
