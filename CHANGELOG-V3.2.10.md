# RedLibertad V3.2.10 — Editor de noticias: botón de reapertura

Base estable: V3.2.9 (PR #168, main `a34b3c8543f3f50da186db87785bf8752df3dc6d`).

## Error confirmado en producción
En Administración → Revisión de noticias → filtro Aprobadas → Ver revisión, el formulario de una noticia aprobada muestra únicamente «Cerrar», sin «Reabrir para edición», aunque el backend admite la reapertura. Una captura mostró el titular «Un falso aviso del banco puede acabar en estafa: cómo reconocer el engaño Copiar» imposible de corregir desde la interfaz.

## Causa
El botón se incluyó en el HTML con la clase CSS permanente `hidden`, que impone `display:none!important`. El código JavaScript solo cambiaba la propiedad `button.hidden`, sin quitar dicha clase; por tanto el botón nunca podía aparecer.

## Correcciones
- El botón inicia con el atributo nativo `hidden`, sin la clase permanente `hidden`; la lógica sincroniza atributo y clase según estado Pendiente/Aprobado/Rechazado.
- El estilo garantiza que los controles marcados `hidden` permanezcan ocultos cuando corresponda.
- Después de reabrir, el filtro pasa a Pendientes para localizar la noticia y modificar el texto.
- Tras guardar o cambiar el estado editorial, también se actualizan los paneles de Publicaciones, Calidad, Planificación y Mesa diaria; desaparecen recuentos obsoletos sin recargar la página completa.
- No se salta la revisión humana ni los controles de calidad: una noticia reabierta requiere nueva aprobación y comprobación de calidad vigente antes de poder publicarse.

## Validación
1. CI completa y test `editorial-review-v322` ampliado.
2. Desplegar versión 3.2.10 en Coolify y verificar `/api/health`.
3. Filtro Aprobadas → Ver revisión: botón «Reabrir para edición» visible junto a Cerrar.
4. Pulsar Reabrir: la noticia pasa a Pendientes.
5. Revisar y editar: borrar solamente « Copiar» del titular, corregir la nota de revisión si contiene «Pendiente de confirmar», y guardar borrador.
6. Volver a aprobar con comprobaciones reales, pasar control de calidad y publicar manualmente.
7. Verificar que no cambia ninguna publicación existente, medio local, cuenta real o configuración RSS.
