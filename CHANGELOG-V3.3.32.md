# V3.3.32 — Auditoría y consolidación sin ruptura de contratos

- Por compatibilidad, el campo técnico `version` continúa siendo V3.2.77, utilizado por pruebas y herramientas históricas. Se añade un campo independiente `releaseMilestone: "3.3.32"` a `/api/health` y `/api/public-config`, que permite identificar la etapa de desarrollo en ejecución sin alterar el contrato anterior.
- El commit desplegado continúa validándose exclusivamente desde `SOURCE_COMMIT` cuando Coolify lo proporciona. Nunca se infiere a partir de GitHub.
- Se renueva la caché pública de PWA a V3.3.32; las respuestas de API, contenido privado, medios y administración siguen fuera de esa caché.
- Se adaptan comprobaciones históricas que asociaban funciones ajenas a una versión fija; el guard de publicación, mensajes y navegación mantiene sus regresiones.
- Auditoría CI automatizada de versión/etapa, accesos admin, caché PWA, identificador de despliegue y límites de verificación externa.
- Ninguna migración, nuevo usuario, email, pago, cambio visual ni publicación automática.
- Sigue siendo necesaria la comprobación real de Coolify y `/api/health` tras desplegar.
