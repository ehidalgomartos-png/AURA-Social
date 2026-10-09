# RedLibertad V3.2.21 — Recuperación segura de noticias sin fuente RSS

Base estable: **V3.2.20**, commit `d7a3bcbfd871be5cbf5b90152b1ab4d4f12a7378`.

## Funciones
- Cuando una noticia no tiene fuente RSS activa, el editor administrativo muestra **«Recuperar noticia sin fuente RSS»**.
- Un endpoint de solo lectura presenta las fuentes autorizadas y preparadas compatibles con el dominio HTTPS de la noticia y su categoría. Se ignora únicamente el prefijo `www.`; otros dominios/subdominios se rechazan de forma conservadora. Fuentes legítimas alojadas en un dominio RSS externo necesitarán otro flujo futuro; no se asume identidad.
- El administrador escoge una fuente y redacta un **motivo obligatorio de al menos 12 caracteres**, con confirmación explícita.
- El servidor vuelve a comprobar la revisión, origen ausente, dominio del artículo, fuente `approved`, perfil `ready`, categoría, y ausencia de una publicación pública visible, mediante locks dentro de una transacción.
- Re-vincula solo `source_id` y `profile_id`, conserva título/resumen/URL, limpia la aprobación anterior, cambia el estado a `pending` y aumenta `revision` para invalidar controles de calidad antiguos.
- Registra `relink_source` en `editorial_audit` con actor, fuente anterior conocida, fuente nueva, revisión y motivo. No publica automáticamente.
- El panel regresa a **Pendientes**, recupera la noticia y exige nueva revisión de hechos, derechos, originalidad y calidad, con posterior publicación exclusivamente manual.
- Si la noticia ya tiene publicación visible, no permite reconectar la fuente hasta retirarla de manera independiente.
- Para un eventual segundo borrado de una fuente re-vinculada, actualiza las instantáneas del nombre y el identificador de la **fuente más reciente**, conservando el historial anterior en auditoría.

## Seguridad y límites
Sin trabajos automatizados ni IA de pago, sin datos de usuario afectados, sin borrar multimedia o publicaciones. Una coincidencia de dominio **no demuestra hechos, autoría, derechos ni que la fuente sea la correcta**. Enlaces de artículo y RSS que no compartan hostname (salvo `www.`) no podrán re-vincularse por esta vía. Sin operaciones en lote; cada noticia requiere consentimiento específico.
