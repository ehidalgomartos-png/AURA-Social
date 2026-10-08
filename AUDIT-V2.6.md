# RedLibertad V2.6 — Auditoría de estabilidad y calidad

**Base:** V2.5.0 fusionada en `main` (`c8ce68e0cf8e7b8fac349b616eec3c9143a54ac3`).

**Alcance V2.6:** endurecimiento de dos flujos concretos (acceso/alta y PWA/push), automatización de comprobaciones y protocolo de validación operativa. **No equivale a certificar todas las funcionalidades con usuarios reales**.

## Evidencia automática (ejecutar en PR)

| Control | Orden / evidencia | Alcance |
|---|---|---|
| Sintaxis completa JS | `npm run check:syntax` | server, src, public, db, scripts, tests |
| Consentimientos legales | `npm run test:legal` | No regresión V1.98–V2.5 |
| Acceso y registro | `npm run test:smoke` | Doble envío, error de red, restaurar botones |
| PWA / push | `npm run test:smoke` | Destinos locales, precache, exclusiones de caché |
| Contratos sociales | `npm run test:smoke` | IDs de vistas, registro de rutas, readiness |
| Verificación HTTP | `npm run smoke:production -- https://redlibertad.com` | GET públicos + 401 privados, después de desplegar |

## Matriz de comprobación real (pendiente; requiere Coolify y cuentas de prueba)

| Prioridad | Área | Casos mínimos | Estado |
|---|---|---|---|
| P0 | Disponibilidad | Arranque, health, readiness PostgreSQL, reinicio | Pendiente |
| P0 | Alta y acceso | Registro +18, consentimiento, login, error de red, reintentos | Pendiente |
| P0 | Publicaciones | Texto, foto/vídeo, edición, eliminación, compartir, contenido sensible | Pendiente |
| P0 | Privacidad | Bloqueos, cuentas no descubribles, audiencias, consentimiento de participantes | Pendiente |
| P0 | Mensajes | Chat individual/grupal, envío, recibos, adjuntos, bloqueo | Pendiente |
| P0 | Persistencia | Fotos/vídeos tras redeploy, restauración backup PostgreSQL y multimedia | Pendiente |
| P1 | Inicio/Descubrir | Para ti, Siguiendo, Nuevo, filtros, sugerencias, sin duplicados | Pendiente |
| P1 | Stories y Reels | Reproducción, navegación, permisos, vistas y caducidad | Pendiente |
| P1 | Notificaciones | Contadores, push opt-in/out, enlaces a la app, estado leído | Pendiente |
| P1 | Comunidades/Eventos | Crear, unirse, publicar, moderar, RSVP, permisos | Pendiente |
| P1 | Moderación | Denunciar, revisar, sancionar, verificación, admin no aparece en sugerencias | Pendiente |
| P1 | SEO público | /robots.txt, sitemap, páginas públicas, meta noindex, Canonical | Pendiente |
| P1 | Móvil/PWA | Android Chrome, iOS Safari, safe areas, teclado, offline parcial, instalación | Pendiente |
| P2 | Accesibilidad | Teclado, foco, lector de pantalla, zoom al 200%, contrastes | Pendiente |
| P2 | Rendimiento | Tiempo de inicio, scroll largo, imágenes, reintentos y red lenta | Pendiente |

### Criterios para aprobar la fase

1. GitHub Actions y pruebas automatizadas en verde.
2. Ningún fallo **P0** sin resolver en producción.
3. Los flujos móviles críticos de login, feed, publicaciones y mensajes se han comprobado con cuentas de prueba.
4. Existe copia de seguridad **restaurable** de PostgreSQL y multimedia persistente, sin eliminar el origen actual.
5. `/api/ready` responde con `ok:true` y base de datos disponible.
6. La aprobación final de despliegue se registra aparte; una PR fusionada por sí sola **no** verifica la experiencia productiva.

### Protocolo ante una regresión

- No seguir desplegando nuevas versiones si una ruta crítica falla.
- Registrar pantalla, navegador, dispositivo, hora, URL y pasos (sin secretos ni datos privados).
- Si el fallo aparece con V2.6, comparar con el último commit estable V2.5 y revertir la release con un nuevo despliegue del commit estable si es necesario.
- Antes de un rollback, comprobar posibles cambios de esquema/medios (esta fase no los introduce).
- Repetir smoke y pruebas de usuario tras la corrección.

## Recomendación Coolify

- `/api/health` confirma que el proceso Express atiende peticiones, pero **no prueba PostgreSQL**.
- `/api/ready` comprueba la configuración crítica y hace `SELECT 1` en PostgreSQL; responde 503 cuando no hay conexión.
- Revisar por separado alertas, logs, backup externo y volumen `UPLOAD_DIR`.
- El script HTTP de V2.6 es de solo lectura y no sustituye las pruebas de sesión real.
