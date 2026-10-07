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
- Abrir Ayuda y feedback desde escritorio y desde Perfil en móvil.
- Enviar un Problema, una Sugerencia y una Duda de prueba.
- Confirmar que el usuario ve el estado de sus propios envíos.
- Confirmar que administración puede revisar, resolver, reabrir y añadir una nota visible.
- Crear una cohorte beta de prueba y añadir/quitar un usuario.
- Crear una feature flag de prueba limitada a cohortes.
- Verificar que un usuario fuera de la cohorte recibe la función desactivada.
- Verificar que un usuario dentro de la cohorte recibe la función activada.
- Probar el kill switch global y confirmar que prevalece sobre cualquier cohorte.
- Probar `support_center`: apagarlo, comprobar que desaparece/queda bloqueado, y reactivarlo.
- Verificar que el contexto de soporte no contiene cuerpos de mensajes, posts ni archivos.
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


## 9. Privacidad del soporte beta
- El soporte solo debe guardar el texto que el usuario decide enviar.
- El contexto automático permanece limitado a información técnica básica y no incluye contenido social privado.
- No usar feedback individual para ranking, publicidad, recomendaciones ni perfilado.
- Usar el request ID únicamente para diagnóstico operativo.


## 10. Release control durante la beta
- Crear una feature flag antes de exponer una función experimental a usuarios.
- Empezar con `default_enabled=false` y asignar una cohorte pequeña cuando la novedad necesite validación.
- Usar el kill switch ante errores funcionales, de seguridad o rendimiento; no hace falta retirar todo el despliegue.
- Pausar una cohorte conserva sus miembros para poder reanudarla después.
- Antes de activar una función para todos, repetir los smoke tests con al menos una cohorte beta.
