# AURA V0.3.3 — Message Preview — Consentimiento, Mensajes y PWA

AURA es una comunidad social +18 en la que la desnudez adulta consentida puede existir como una categoría de contenido, con controles de edad, privacidad, consentimiento y moderación.

**Claim de esta versión:** “Aquí, un pecho sigue siendo un pecho.”

## Novedades V0.3

### Mensajería privada
- Conversaciones 1 a 1.
- Texto, imagen y vídeo.
- Clasificación `normal`, `sensitive` y `nudity`.
- El contenido sensible recibido queda oculto hasta que el destinatario lo acepte para ese remitente.
- Para aceptar contenido sensible el destinatario debe tener la mayoría de edad verificada.
- La desnudez por mensaje solo puede enviarla una cuenta con edad y creador verificados.
- Bloqueos existentes también bloquean la mensajería.

### Consentimiento entre participantes
Al crear una publicación se pueden indicar usuarios que aparecen en ella.

- La publicación queda `under_review` y fuera del feed.
- Cada participante recibe una solicitud.
- Cuando todos autorizan, la publicación pasa a `published`.
- Un rechazo impide la publicación.
- Una persona que ya autorizó puede retirar su consentimiento posteriormente.
- La retirada oculta inmediatamente la publicación mientras queda pendiente de revisión.

### Notificaciones
- Nuevos seguidores.
- Mensajes.
- Solicitudes de consentimiento.
- Consentimientos aprobados, rechazados o retirados.
- Contador de no leídas y acción “Marcar todo leído”.

### Perfil V0.3
- Nombre visible y biografía.
- Ubicación.
- Web.
- Cambio de avatar y portada mediante el sistema de subida multimedia.
- Preferencia de contenido sensible.
- Panel de consentimientos asociado al propio perfil.

### PWA
- `manifest.webmanifest`.
- Service Worker.
- Iconos 192/512.
- Instalación en dispositivos compatibles.
- Caché del shell de aplicación; las APIs y `/uploads` no se cachean.

### Identidad
Se mantiene la paleta propia de AURA:
- Azul noche `#0D2238`
- Marfil `#F5F0E8`
- Turquesa `#2BB7A9`
- Coral `#EF7A5D`

## Actualizar desde V0.2.3 en Render

No hacen falta nuevas variables de entorno para estas funciones.

1. Sustituir en GitHub los archivos de la versión anterior por V0.3.0.
2. Render hará el deploy automático.
3. El Start Command actual puede seguir siendo:

```bash
npm run db:init && npm start
```

`db:init` es idempotente y añadirá las nuevas columnas/tablas.

4. Comprobar:

```text
https://TU-DOMINIO/api/health
```

Debe devolver `"version":"0.3.0"`.

## Variables de entorno básicas

```text
ADMIN_EMAIL
APP_ORIGIN
COOKIE_SECURE=true
DATABASE_URL
JWT_SECRET
NODE_ENV=production
```

No cambies `JWT_SECRET` en producción salvo que quieras invalidar todas las sesiones actuales.

## Multimedia

Por defecto:

```text
MEDIA_STORAGE=local
```

Sirve para desarrollo/pruebas. En Render, el almacenamiento local del Web Service no debe considerarse persistente. Para producción conviene activar Bunny:

```text
MEDIA_STORAGE=bunny
BUNNY_STORAGE_ZONE=
BUNNY_STORAGE_API_KEY=
BUNNY_STORAGE_PUBLIC_BASE_URL=
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
BUNNY_STREAM_CDN_HOSTNAME=
```

## Endpoints nuevos

### Mensajes
- `GET /api/messages/conversations`
- `POST /api/messages/conversations`
- `GET /api/messages/conversations/:id/messages`
- `POST /api/messages/conversations/:id/messages`
- `GET /api/messages/users/:id/sensitive-permission`
- `POST /api/messages/users/:id/sensitive-permission`

### Notificaciones
- `GET /api/notifications`
- `POST /api/notifications/read-all`
- `POST /api/notifications/:id/read`

### Consentimientos
- `GET /api/posts/consents/pending`
- `POST /api/posts/:id/consent`

### Personas
- `GET /api/profiles/search/users?q=...`

## Base de datos añadida

- `notifications`
- `conversations`
- `conversation_members`
- `messages`
- `sensitive_message_permissions`
- `users.location_label`
- `users.website_url`
- `posts.consent_state`

La tabla `post_participants`, ya existente, ahora se usa para el flujo real de consentimiento.

## Seguridad

La ruta de recuperación temporal del administrador heredada de V0.2 sigue deshabilitada siempre que `ADMIN_RECOVERY_TOKEN` no exista en Render.

Antes de un lanzamiento público siguen siendo necesarios, entre otros: proveedor real de verificación +18, revisión jurídica, políticas completas, procedimientos DSA/RGPD, moderación operativa, escaneo/antimalware de archivos, backups, rate limits específicos para mensajes y pruebas de abuso/carga.


## Hotfix V0.3.1

Corrige los botones del panel de administración que visualmente aparecían pero no respondían.

Causa: el panel generaba atributos `onclick` inline, bloqueados correctamente por la Content Security Policy de AURA (`script-src 'self'`).

Cambios:
- `Verificar +18` usa eventos externos compatibles con CSP.
- `Verificar creador` usa eventos externos compatibles con CSP.
- Las acciones de denuncias ya no usan `onclick` inline.
- Se añade feedback visual después de verificar.
- `Verificar creador` sigue verificando simultáneamente mayoría de edad.
- No cambia el esquema de PostgreSQL ni borra datos.


## Hotfix V0.3.2 — Mensajería

Corrige un falso error detectado durante las pruebas de mensajes sensibles.

### Qué ocurría
El mensaje podía quedar guardado correctamente y, si fallaba una tarea secundaria posterior
(como la creación de la notificación), el cliente recibía un error y mostraba
`No se pudo enviar el mensaje`. Al reintentar, podían aparecer mensajes duplicados.

### Cambios
- El guardado del mensaje y la actualización de la conversación son atómicos.
- Una incidencia al crear la notificación ya no invalida un mensaje enviado.
- El botón Enviar se desactiva mientras la petición está en curso.
- Se muestra `Mensaje enviado` únicamente después de recibir confirmación del servidor.
- Si el mensaje se guarda pero falla la recarga visual del chat, se informa de ello sin afirmar que el envío falló.
- No modifica ni elimina datos existentes.


## V0.3.3 — Vista previa de mensajes
- La persona que envía ve la foto o vídeo inmediatamente al seleccionarlo, antes de subirlo o enviarlo.
- La vista previa indica que aún no está enviado y muestra la clasificación Normal/Sensible/Desnudez.
- Botón Quitar para retirar el archivo seleccionado.
- La vista previa es local (`URL.createObjectURL`): seleccionar el archivo no lo sube al servidor.
- El destinatario sigue viendo el contenido sensible según su permiso de consentimiento.
