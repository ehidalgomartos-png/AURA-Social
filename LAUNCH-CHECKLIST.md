# RedLibertad V1.70 — Launch Readiness Checklist

## 1. Código y despliegue
- `main` debe apuntar a V1.70.0 o superior.
- Ejecutar `npm run check:syntax`.
- Coolify debe usar `/api/ready` como healthcheck.
- `/api/health` debe mostrar `version:"1.70.0"` y `configuration.criticalReady:true`.
- `/api/ready` debe responder HTTP 200 y `database:"ready"`.

## 2. Configuración
- `DATABASE_URL` configurada y apuntando a la base correcta.
- `JWT_SECRET` largo, aleatorio y privado.
- En producción: `APP_ORIGIN` con HTTPS y `COOKIE_SECURE=true`.
- Si `MEDIA_STORAGE=local`, `UPLOAD_DIR` debe estar montado en almacenamiento persistente.
- Si Web Push está habilitado, las tres variables VAPID deben estar configuradas.

## 3. Backups y rollback
- Backup reciente de PostgreSQL verificado.
- Backup reciente del volumen de multimedia.
- Conservar el commit estable anterior para rollback.
- No borrar datos, volúmenes ni la base durante una reversión de aplicación.

## 4. Smoke test de usuario
- Registro +18.
- Login y cierre de sesión.
- Editar perfil y avatar.
- Feed Para ti / Siguiendo / Cercanas / Nuevo / VIP.
- Crear post de texto, imagen y vídeo.
- Likes, comentarios, guardados, republicación y compartir.
- Stories y Reels.
- Seguir/dejar de seguir y perfiles.
- Mensajes 1:1 y grupos.
- Respuestas, reacciones, presencia y recibos de lectura.
- Notificaciones y deep links.
- Comunidades y eventos.
- Colaboraciones y consentimientos.
- Centro de confianza, bloqueos, silencios y reportes.
- Administración/moderación.
- Panel Beta real: métricas agregadas cargan correctamente.
- Registrar una incidencia operativa, pasarla a seguimiento, resolverla y reabrirla.
- Confirmar que el panel muestra health/readiness sin exponer secretos.

## 5. Smoke test móvil
- iPhone/Safari y Android/Chrome si están disponibles.
- Bottom nav no tapa contenido ni formularios.
- Teclado virtual no tapa el compositor del chat.
- Modales/bottom sheets permiten llegar al último control.
- Subida de foto/vídeo funciona desde cámara/galería.
- Safe areas correctas en dispositivos con notch.
- PWA abre y actualiza correctamente.

## 6. Observabilidad
- Los errores API devuelven un `X-Request-Id` / `requestId`.
- Revisar logs ante respuestas 5xx o peticiones superiores a 1,5 s.
- No registrar cuerpos de mensajes, contraseñas, tokens ni multimedia privada.

## 7. Criterio de salida
Lanzar a más usuarios solo cuando health/readiness sean correctos, los smoke tests críticos pasen y exista un backup recuperable. La monetización permanece fuera de alcance.


## 8. Operación durante la beta
- Revisar el panel **Beta real** al inicio y al final de cada jornada de pruebas.
- Registrar una incidencia crítica si una función esencial deja de estar disponible para varios usuarios.
- No usar las métricas agregadas para perfilar personas individualmente.
- La tasa de activación es una señal de producto, no un objetivo para introducir presión, rachas o notificaciones compulsivas.
- Resolver una incidencia solo después de repetir el smoke test de la función afectada.
