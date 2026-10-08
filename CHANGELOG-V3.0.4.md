# RedLibertad V3.0.4 — Production Safety Audit

**Base exacta:** V3.0.3 fusionada en `main`, commit `c3a4eed4ee84c43549394511f2829157d32bba8d` (PR #154).

## Objetivo
Antes de ampliar la comunidad, comprobar con evidencia la persistencia de multimedia y el funcionamiento de los sitemaps. No hacer migraciones ni tocar las publicaciones o usuarios.

## Nuevo control 1: multimedia local
Ejecutar **dentro del contenedor de aplicación en Coolify**:

```bash
npm run gate:storage
```

- Solo lee variables `MEDIA_STORAGE`, `UPLOAD_DIR`, metadatos de carpeta y `/proc/self/mountinfo`. No escribe archivos, no elimina contenido ni cambia permisos.
- `blocked`: no se detecta directorio válido, ruta absoluta o montaje dedicado para las subidas. Si solo aparece el overlay raíz del contenedor, detener el lanzamiento hasta revisar Persistent Storage.
- `review`: existe un montaje separado, pero hay que verificar manualmente en Coolify que está configurado como persistente y que sobrevive a un redespliegue; también ocurre si el contenedor no permite leer mountinfo.
- **Nunca** concluye que un volumen tiene copia externa o que se puede restaurar. El resultado incluye `backupVerified:false` y `restoreTested:false` por diseño.
- En Coolify verificar `Persistent Storage` destino `/data/uploads`, la ruta efectiva `UPLOAD_DIR` y la configuración del volumen origen. No cambiar rutas existentes sin inventario de fotos y vídeos.
- Verificar copia externa de PostgreSQL, copia externa de `/data/uploads` y restaurar muestras en un entorno **aislado**, sin tocar la base de producción.

## Nuevo control 2: sitemaps y Search Console
Ejecutar **desde un equipo con acceso web** tras el despliegue:

```bash
npm run gate:seo -- https://redlibertad.com
```

- Comprueba con GET y sin sesión los **nueve XML**: `sitemap-index.xml`, `sitemap.xml`, `sitemap-profiles.xml`, `sitemap-hashtags.xml`, `sitemap-communities.xml`, `sitemap-events.xml`, `sitemap-reels.xml`, `sitemap-topics.xml` y `sitemap-guias.xml`.
- Requiere HTTP 200, Content-Type XML, declaración XML, esquema `/sitemaps.org/schemas/sitemap/0.9`, al menos una entrada `<url>` (o `<sitemap>` en índice), `<loc>` canónico y referencias del índice a los ocho hijos.
- Reporta `http_error`, `unexpected_content_type`, `missing_required_url`, `invalid_xml_root`, etc., sin URLs arbitrarias, secretos, credenciales ni peticiones POST.
- Si un XML devuelve 503 o HTML, revisar logs PostgreSQL y Coolify. La validación sintáctica no demuestra indexación en Google.
- En Search Console reenviar **solo** `https://redlibertad.com/sitemap-index.xml` después de resolver los fallos HTTP/XML.

## Orden recomendado de validación
1. Confirmar V3.0.3 aún en producción y que GitHub Actions de esta PR son verdes antes de autorizar merge.
2. Verificar que existen **copias recientes fuera del VPS** de PostgreSQL y archivos de usuario. Realizar restauración de prueba aislada antes de cambios importantes.
3. Tras la fusión y el despliegue autorizado, confirmar `https://redlibertad.com/api/health` devuelve `version:3.0.4` y `/api/ready` informa base de datos lista.
4. Ejecutar `npm run gate:config`, `npm run gate:storage` desde el contenedor, y `npm run gate:public -- https://redlibertad.com` y `npm run gate:seo -- https://redlibertad.com` desde fuera.
5. Probar en móvil acceso, feed, multimedia, chat, publicaciones, páginas públicas y los nuevos perfiles abiertos en el panel principal.
6. Documentar resultados y adjuntar capturas de **estado**, sin copiar contraseñas, URLs de BD ni tokens.

## Límites explícitos
- Sin acceso a Coolify ni al entorno de restauración no se puede declarar `backupVerified` o `coolifyVerified` verdaderos.
- No se altera PostgreSQL, los usuarios, posts, vídeos, fotos, privacidad, reglas SEO ni monetización.
- Un sitemap correcto puede no ser indexado por Google; Google decide rastreo e indexación.
