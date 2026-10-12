# RedLibertad V3.2.43 — Borrador editorial completo con IA

## Despliegue
Base: V3.2.42.1 estable. Ningún paso manual de migración de PostgreSQL es necesario: el router crea sus columnas y tabla de auditoría/cuotas al utilizarlo. Mantener el volumen persistente de `UPLOAD_DIR` en el VPS.

Variables en **Coolify → RedLibertad → Environment Variables** (secretos únicamente del servidor):

```dotenv
OPENAI_API_KEY=<guardar_en_Coolify_no_en_GitHub>
EDITORIAL_AI_MODEL=gpt-4.1-mini
EDITORIAL_IMAGE_MODEL=gpt-image-1
EDITORIAL_AI_IMAGE_ENABLED=false
EDITORIAL_AI_IMAGE_DAILY_LIMIT=10
EDITORIAL_AI_IMAGE_MONTHLY_LIMIT=30
```

**Por defecto, la generación de imágenes permanece desactivada y no consume créditos.**
Después de añadir saldo a la API y configurar la clave, activar `EDITORIAL_AI_IMAGE_ENABLED=true` solo cuando quieras probarla. Requiere redeploy; no compartir la clave en chat ni repositorio. `EDITORIAL_AI_IMAGE_DAILY_LIMIT` nunca puede superar 10 y `EDITORIAL_AI_IMAGE_MONTHLY_LIMIT` nunca puede superar 30.

## Funcionalidad
- Admin → Centro Editorial → Revisar noticia → **Generar ilustración con IA** para la imagen sola.
- **Crear titular, resumen e imagen con IA** para un borrador completo. El titular y resumen se aplican en el editor SIN GUARDAR y exigen revisión, confirmación y Guardar borrador. La imagen queda local en VPS pero obliga a revisión y nuevo control de calidad. Nunca se publica automáticamente.
- Si falta saldo, clave, permisos o evidencias, aparece un mensaje de error en lugar de publicar una imagen o texto falso.
- Ilustración conceptual 1536×1024 JPEG de calidad baja, no fotorrealista; en temas sensibles, tratamiento abstracto y sobrio.
- Máximo **1 imagen IA por noticia** durante la vida del candidato, incluso si luego la retiras.
- Los contadores de cuotas quedan guardados en PostgreSQL y se sincronizan entre procesos mediante bloqueo transaccional; reservas caducadas se marcan como fallidas.
- Se registra modelo, prompt y fecha de generación; la imagen y la etiqueta se guardan con la edición. Una imagen IA siempre se muestra en Noticias y en Inicio con «Imagen ilustrativa generada con IA».
- La publicación sigue exigiendo aprobación humana de fuentes y calidad. No se modifican fotos RSS ni del usuario, ni la PWA o el Service Worker.

## Validación posterior al despliegue
1. Probar inicio y login. Verificar `/health` y la versión en administración.
2. Sin API activada: pulsar Crear imagen IA y comprobar mensaje «desactivada».
3. Con API activada: noticia de prueba normal; revisar titular y resumen antes de guardarlos.
4. Ver imagen guardada en VPS, sin publicación. Verificar límite de 1 por noticia.
5. Probar noticia sensible: debe ser ilustración conceptual sin falsa escena real.
6. Aprobar y publicar manualmente después de contrastar fuente y derechos; comprobar etiqueta en Noticias, detalle e Inicio.
7. Comprobar controles de cuota diaria y mensual. No existe bloqueo económico externo garantizado: los límites de proyecto de OpenAI pueden ser orientativos y las operaciones de IA de texto consumen aparte.

## Costes
El proveedor factura por generación y por texto. El límite de uso en la aplicación limita el número de llamadas de imagen admitidas por este router; no es un tope económico universal para todos los servicios de OpenAI.
