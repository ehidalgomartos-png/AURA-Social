# RedLibertad Resuelve V3.6.0 — Consolidación 2.0

## Objetivo y alcance

Consolidar las mejoras de las V3.5.21–V3.5.37: responder y resolver peticiones reales, pedir aclaraciones, elegir temas de ayuda voluntarios, perfiles opcionales, moderación humana, biblioteca de soluciones revisadas, SEO conservador, compartir preguntas con vistas previas, registro unificado y administración.

No se genera contenido artificial, perfiles ficticios, respuestas automáticas, valoraciones, resultados comerciales ni estadísticas estimadas.

## Endurecimiento técnico

1. **Búsquedas públicas acotadas**. La API de preguntas similares limita a 120 consultas por minuto y origen para reducir cargas repetidas sin exigir registro; entrada entre 8 y 125 caracteres y hasta cinco resultados reales. La respuesta sigue siendo opcional en el formulario.
2. **Aislamiento de sesión**. Las recomendaciones de ayuda se obtienen mediante endpoints autenticados y se descartan si cambia la identidad de la sesión durante una petición; no se muestran datos de la sesión anterior.
3. **Estadísticas privadas**. La serie de siete días solo se entrega a administradores y únicamente contiene cantidades de actividad visible con cuentas activas. Ninguna cifra conduce automáticamente a moderación.
4. **Indexación voluntaria**. La página pública principal de Resuelve no es indexable; las fichas individuales requieren consentimiento individual y aprobación editorial. Los temas necesitan al menos tres soluciones elegibles. Retirar permiso devuelve 404/noindex.
5. **Experiencia mobile-first**. Formularios accesibles, buscadores redondeados, navegación a peticiones y ayudas en pantalla pequeña, controles de 44–48 px y borrador conservado al consultar preguntas similares.
6. **Cuenta unificada**. Desde `/resuelve?registro=1` se inicia el registro con la misma cuenta que funciona en RedLibertad.

## Lista de verificación de lanzamiento

- [ ] Fusionar en orden V3.5.35, V3.5.36, V3.5.37 con sus pruebas JavaScript y PostgreSQL 18 correctas.
- [ ] Ejecutar los tests de consolidación y **toda la suite** antes de la fusión V3.6.0.
- [ ] Confirmar el commit desplegado en Coolify contra `main`.
- [ ] Verificar `/api/health`, `/api/ready`, acceso anónimo y registro directo.
- [ ] Revisar en ordenador y móvil: campos redondeados, sugerencias, peticiones para ayudar y administración.
- [ ] Comprobar SEO público: consentimiento activo, revocación, sitemaps y páginas sin contenido que devuelven noindex.
- [ ] Confirmar moderación humana y ausencia de avisos o publicaciones automáticas por sugerencias.
- [ ] Revisar logs y rendimiento de búsquedas públicas sin exponer contenido privado.
- [ ] No anunciar como desplegada una versión que solo se ha fusionado en GitHub.

## Principios permanentes

Resuelve es para solucionar problemas entre personas, no una tienda. Los productos son una última opción y los servicios profesionales se mencionan cuando son relevantes y con transparencia. Las recomendaciones son orientativas y la experiencia compartida no equivale a una certificación profesional.
