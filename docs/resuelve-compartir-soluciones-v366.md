# Resuelve V3.6.6 — Compartir soluciones y temas desde sus páginas públicas

## Objetivo
Una persona que descubre una solución revisada desde un enlace externo o desde un buscador podrá enviársela a alguien a quien le sea útil, **sin necesidad de registrarse** y sin convertir Resuelve en un catálogo comercial.

## Qué incluye
- Controles de WhatsApp, Facebook, Telegram, correo y copiar enlace en las páginas individuales de soluciones que siguen siendo públicas y autorizadas.
- Botón de compartir desde el menú nativo del móvil cuando el navegador lo permita.
- En las páginas temáticas, los controles aparecen únicamente con tres o más soluciones públicas, autorizadas y revisadas.
- Mensajes predeterminados neutros: invitan a consultar la ayuda y enlazan la página, sin copiar nombres de usuarios ni textos de respuestas.
- Todos los métodos funcionan solo después de una acción explícita. No hay envíos automáticos, contactos importados, campañas, mensajes directos ni métricas ficticias.
- Enlaces y texto escapados, URLs canónicas restringidas y apertura de canales externos con protección `noopener noreferrer`. El portapapeles ofrece alternativa manual.

## Privacidad
Las páginas individuales siguen dependiendo de la comprobación que ya existe: respuesta elegida visible, revisión editorial, consentimiento SEO, cuentas activas y ausencia de exclusión. Revocar el consentimiento hace que el enlace deje de mostrar esa página. La vista previa pública de una pregunta permanece `noindex` y no ofrece estos controles nuevos.

## Verificación
Pruebas de formas de URL, sanitización, ausencia de envíos automáticos, seguridad del HTML, navegación de móvil y reglas de indexación por tema. GitHub Actions y PostgreSQL 18 antes de fusionar; comprobar Coolify por separado.
