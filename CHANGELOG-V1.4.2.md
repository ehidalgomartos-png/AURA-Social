# RedLibertad V1.4.2 — Persistent Media Hotfix

Base estable: RedLibertad V1.4.1.

## Multimedia persistente
- Corrige la subida de archivos cuando UPLOAD_DIR apunta a un volumen Docker montado en /data/uploads.
- Maneja el error EXDEV (movimiento entre sistemas de archivos distintos) usando copy + unlink como fallback seguro.
- Evita que la subida falle al mover archivos temporales del filesystem del contenedor al volumen persistente.
- Compatible con MEDIA_STORAGE=local y UPLOAD_DIR=/data/uploads.

## Compatibilidad
- Sin cambios PostgreSQL.
- /api/health actualizado a 1.4.2.
- Cache PWA actualizado a V1.4.2.
