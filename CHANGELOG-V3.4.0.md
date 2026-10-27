# V3.4.0 — Crecimiento consolidado y control de versión

- `/api/health` y `/api/public-config` pasan a informar `releaseMilestone: 3.4.0`. El campo histórico `version: 3.2.77` se conserva por compatibilidad.
- La PWA activa un nuevo nombre de caché pública (`v3400`) para renovar contenido de shell sin almacenar APIs, chats, medios ni áreas administrativas.
- CI comprueba en conjunto los controles existentes de crecimiento real, D1/D7, SEO, publicación, privacidad y rendimiento móvil/escritorio. No se modifican métricas ni consentimientos.
- Se documenta la aceptación con una separación explícita entre pruebas automatizadas y validaciones manuales aún pendientes (dispositivos reales, Coolify, Search Console y restauración de backups).
- Sin cambios de base de datos, monetización, correos masivos ni actividad ficticia.
