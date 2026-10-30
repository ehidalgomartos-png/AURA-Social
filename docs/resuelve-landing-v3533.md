# Resuelve V3.5.33 — Presentación pública para dar confianza

## Objetivo
Explicar **qué es Resuelve, cómo pedir ayuda y cómo ayudar a otras personas** mediante una página editorial útil y sin reclamos comerciales. La landing no simula actividad, estadísticas, testimonios o historias reales que no existan.

## Página
- URL canónica: `https://redlibertad.com/resuelve/como-funciona`.
- HTML propio, SSR estático accesible y rápido en móvil: explicación, cuatro pasos, ejemplos claramente identificados como ejemplos, normas de confianza y preguntas frecuentes.
- Reafirma que los servicios profesionales pueden ser una opción cuando sea necesaria, pero no una obligación; los productos son secundarios.
- Metadata HTML indexable, OG social y sitemap dedicado `/sitemap-resuelve-presentacion.xml` registrado en el índice general y en `robots.txt`.
- Enlace visible desde la portada de Resuelve para mejorar la navegación entre la información y la comunidad.

## Registro unificado sin salir de Resuelve
El botón «Crear mi cuenta en Resuelve» dirige a `/resuelve?registro=1` y abre el formulario de alta directamente en Resuelve cuando el visitante no tiene sesión. El formulario existente crea una única cuenta para Resuelve y RedLibertad. No se fuerza la navegación a una página externa de RedLibertad, ni se publica ninguna pregunta automáticamente.

## Política de privacidad SEO
La nueva landing es **contenido propio**, no reutiliza preguntas ni respuestas de usuarios, y puede indexarse independientemente de los permisos de la biblioteca. La portada dinámica `/resuelve` sigue siendo `noindex`; las páginas individuales de soluciones mantienen los controles de autorización y revisión de la V3.5.29–V3.5.31. La existencia de la landing en un sitemap no garantiza indexación en Google.

## Verificación
Probar CTA de registro con sesión abierta y cerrada, móvil, escritorio, metadatos, enlaces y menú. CI JavaScript y PostgreSQL 18 antes de fusionar. Validar despliegue real en Coolify de forma independiente.
