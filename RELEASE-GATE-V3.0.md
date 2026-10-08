# RedLibertad V3.0.0 — Growth Ready / criterios de lanzamiento

**Código base:** RedLibertad V2.20.0, commit `1d42b7324b9d4e708f03d8d8a6464993fc2ee512` (#150 fusionado).

## Qué se ha implementado en V3.0

- `npm run gate:config`: preflight **local y sin escrituras** de NODE_ENV, URL canónica, HTTPS/cookies, presencia/longitud del secreto JWT, DATABASE_URL, MEDIA_STORAGE y directorio UPLOAD_DIR. No muestra valores de secretos ni conexiones.
- `npm run gate:public -- https://redlibertad.com`: **14 pruebas HTTP externas de lectura**, con espera máxima por petición, URL HTTPS canónica fija, sin cookies ni credenciales, sin redirecciones ni mutaciones.
- Las verificaciones incluyen versión exacta, estado de PostgreSQL, /app, robots, sitemap índice y de guías, páginas SEO, manifest, service worker y rechazo 401 anónimo en cuatro rutas privadas.
- Resumen JSON apto para revisar o archivar manualmente y código de salida distinto de cero si hay fallos.
- Pruebas simuladas en GitHub Actions **sin llamar a producción**, con escenarios de versión incorrecta, rutas privadas accesibles, fallo SEO y configuración insegura.
- No cambia esquemas ni borra usuarios, publicaciones, multimedia ni mensajes. No activa monetización.

## Secuencia de lanzamiento (obligatorio, manual)

1. **PR de V3.0**: GitHub Actions completas, review y autorización explícita de fusión.
2. **Protección de datos**: antes del despliegue comprobar una copia actual de PostgreSQL fuera del VPS. Realizar restauración de prueba en un entorno aislado y anotar fecha, resultado, destino y responsable.
3. **Multimedia persistente**: comprobar copia externa del volumen `/data/uploads` y restaurar una imagen/vídeo de prueba. Una comprobación de permisos o espacio disponible no demuestra persistencia ni recuperabilidad.
4. **Coolify**: verificar servicio PostgreSQL, variables seguras en Coolify, montaje `/data/uploads`, certificados HTTPS, proxy, revisión/commit que se despliega y registros de inicio.
5. **Preflight en contenedor desplegado**: `npm run gate:config`. El campo `blocked` debe ser 0 y los avisos deben resolverse o anotarse con justificación. No publicar secretos en capturas.
6. **Health y readiness**: confirmar `https://redlibertad.com/api/health` con versión `3.0.0` y configuración crítica preparada; confirmar `/api/ready` con base `ready`.
7. **Gate HTTP desde red externa**: ejecutar `npm run gate:public -- https://redlibertad.com` en una máquina con acceso a la web. Deben superar 14/14. Si falla cualquiera, no dar lanzamiento por validado.
8. **Experiencia de usuario real**: desde un móvil, probar registro, verificación +18, acceso, feed, publicaciones de texto/foto/vídeo, permisos de audiencia, comentarios, chat privado, Stories, Reels, notificaciones, borrado de mensajes, comunidades, consentimiento, bloqueos, PWA.
9. **Seguridad y SEO**: en ventana privada comprobar que no se puede leer una publicación/reel/perfil restringido; revisar OG, canonical, sitemaps y privacidad. Confirmar sitemaps en Search Console después de publicar.
10. **Monitorización externa**: disponer de un chequeo ajeno a la aplicación para caídas completas de Node/PostgreSQL y alertas con responsable. La bandeja V2.15/16 no detecta si el proceso entero está muerto.
11. **Observación**: revisar durante la fase inicial de lanzamiento los errores, saturación del pool, espacio libre, colas y reportes. No interpretar una CI verde como señal de que producción funciona.

## Criterio de aprobación

V3.0 **no se considera validada en producción** hasta que las comprobaciones automáticas exteriores y los puntos manuales críticos se hayan documentado con evidencia. El resultado JSON marca expresamente `coolifyVerified:false`, `backupRestorationVerified:false` y `releaseApproved:false` porque el script no puede certificar esas acciones.

## Si falla una comprobación

- Detener el lanzamiento de V3.0. No eliminar usuarios, BD, publicaciones ni archivos.
- Revisar logs y revisión en Coolify, corregir configuración y repetir las pruebas.
- Si es necesario volver a una revisión anterior, conservar backups y comprobar compatibilidad de esquema y datos antes de revertir. No ejecutar migraciones destructivas automáticamente.

## Próximos hitos tras validación

- Analizar métricas reales de captación/retención (V2.19) y actividad de comunidades (V2.20) con cohortes suficientes.
- Mejorar lo que muestren los datos de uso y reportes móviles; no introducir complejidad sin evidencia.
- Monetización continúa aparcada.
