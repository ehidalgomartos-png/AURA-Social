# AURA V0.2.2 — Admin Recovery

## Hotfix V0.2.1

- Corrige cuentas creadas antes de configurar `ADMIN_EMAIL`.
- En cada login, si el email de la cuenta coincide exactamente (ignorando mayúsculas/minúsculas y espacios) con `ADMIN_EMAIL`, la cuenta se promociona automáticamente a administrador.
- El JWT nuevo incluye `isAdmin: true`.
- No es necesario borrar la cuenta ni modificar PostgreSQL manualmente.
- Después del despliegue: cerrar sesión e iniciar sesión de nuevo.


Segunda versión funcional de AURA: red social exclusiva para adultos con contenido sensible bajo control del usuario y moderación prioritaria.

## Identidad visual

Se mantiene una identidad totalmente distinta de los otros proyectos:

- Azul noche `#0D2238`
- Azul pizarra `#173A52`
- Marfil `#F5F0E8`
- Turquesa `#2BB7A9`
- Coral `#EF7A5D`

## Nuevo en V0.2

- Interfaz social responsive real.
- Navegación escritorio + dock inferior móvil.
- Feed: Para ti / Siguiendo / Nuevo.
- Explorar.
- Reels como tipo de publicación.
- Stories con caducidad a las 24 horas.
- Crear publicación desde foto o vídeo.
- Preview antes de publicar.
- Upload real de multimedia.
- Modo local para desarrollo.
- Adaptador Bunny Storage para imágenes.
- Adaptador Bunny Stream para vídeos.
- Perfil visual y estadísticas.
- Activar/desactivar contenido sensible.
- Panel admin web.
- Buscador de usuarios en administración.
- Verificación manual +18 y creador desde admin.
- Cola de denuncias, con prioridad crítica para menores y contenido íntimo no consentido.
- Auditoría de decisiones.

## Importante sobre +18

La fecha de nacimiento durante el alta **no equivale a una verificación de edad real**. En esta versión, `age_verified` se activa manualmente desde Admin para permitir pruebas. Antes de producción deberá conectarse a un proveedor o sistema de acreditación de mayoría de edad apropiado.

## Multimedia

### Desarrollo: local

En `.env`:

```env
MEDIA_STORAGE=local
```

Los archivos se guardan en `/uploads`. Es útil para desarrollo, pero **no debe usarse en Render como almacenamiento permanente**, porque el filesystem del servicio no debe considerarse almacén persistente del producto.

### Producción: Bunny

```env
MEDIA_STORAGE=bunny
BUNNY_STORAGE_ZONE=...
BUNNY_STORAGE_API_KEY=...
BUNNY_STORAGE_PUBLIC_BASE_URL=https://tu-pull-zone.b-cdn.net
BUNNY_STREAM_LIBRARY_ID=...
BUNNY_STREAM_API_KEY=...
BUNNY_STREAM_CDN_HOSTNAME=...
```

- Imágenes → Bunny Storage.
- Vídeos → Bunny Stream.

## Instalación

```bash
cp .env.example .env
npm install
npm run db:init
npm run dev
```

Después:

- Portada: `http://localhost:3000/`
- Red social: `http://localhost:3000/app`
- Administración: `http://localhost:3000/admin`

## Crear administrador

Configura antes del registro:

```env
ADMIN_EMAIL=tu-email@example.com
```

La cuenta registrada con ese email tendrá permiso de administrador.

## Flujo de prueba recomendado

1. Registra el admin usando el email de `ADMIN_EMAIL`.
2. Registra otra cuenta.
3. En `/admin`, busca esa cuenta.
4. Pulsa **Verificar +18** o **Verificar creador**.
5. Inicia sesión con esa cuenta.
6. En Perfil activa **Mostrar contenido sensible**.
7. Ya puedes probar la publicación clasificada como desnudez con una cuenta de creador verificada.

## Estructura preparada para V0.3

La siguiente versión debería incorporar:

- Mensajes privados reales.
- Solicitud previa antes de recibir multimedia sensible por DM.
- Consentimiento entre participantes etiquetados.
- Revocación de consentimiento.
- Notificaciones.
- Comentarios visuales.
- Guardados y compartir.
- Perfil editable desde UI.
- Moderación automática / clasificación asistida.
- Verificación +18 mediante proveedor real.
- PWA instalable y push notifications.

## Estado de seguridad

V0.2 es una base de desarrollo. Antes de un lanzamiento público se requieren revisión jurídica, verificación de edad adecuada, políticas completas, procesos DSA, privacidad/RGPD, protección de secretos, backups, pruebas de carga, protección antiabuso, antivirus/escaneo de archivos y moderación operativa.


## Recuperación temporal de administrador

1. En Render añade `ADMIN_RECOVERY_TOKEN` con un valor largo y aleatorio.
2. Despliega.
3. Abre `/admin-recovery`.
4. Introduce el email configurado en `ADMIN_EMAIL`, el token temporal y una nueva contraseña.
5. Tras el éxito, elimina `ADMIN_RECOVERY_TOKEN` de Render y vuelve a desplegar.

La recuperación también marca la cuenta como administradora y crea una nueva sesión.
