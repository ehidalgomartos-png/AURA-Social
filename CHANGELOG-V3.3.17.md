# V3.3.17 — Centro de actividad de Administración

Se introduce `/admin/actividad`, página independiente de consulta y solo para administradores. Enlace visible desde `/admin`.

- Indicadores para las últimas 24 horas, 7 días o 30 días: registros, publicaciones, Reels, Stories, comentarios, mensajes, conversaciones con actividad, seguimientos, Me gusta y denuncias. Se incluyen contadores actuales de cuentas activas y denuncias abiertas.
- Cronología paginada de publicaciones y comentarios **públicos de contenido normal**, Reels y Stories públicas aún activas, y registros de perfiles visibles. Solo se muestran actores activos que permiten descubrir su perfil y mostrar su actividad.
- Filtros por categoría; enlaces a contenido público, controles de paginación, botón de actualización y actualización opcional cada minuto mientras la pestaña está visible.
- **Privacidad:** mensajes privados, participantes, identidades de remitentes y destinatarios, contenido de mensajes y detalles de denuncias nunca se exponen en la cronología. Para mensajes se muestran únicamente cifras agregadas. No se modifican permisos de contenido ni bloqueos.
- Mobile-first, accesibilidad y manejo de fallos sin borrado de datos existentes; no requiere nuevas tablas ni migraciones.
- Los endpoints están protegidos con `requireAdmin`; la página también, y excluida de indexación.
- Las pruebas deben verificar filtros, autenticación, campos de salida, SQL limitado a contenido visible, seguridad y PostgreSQL 18. El despliegue se verifica por separado.
