# RedLibertad V3.2.13 — Titulares orientativos y acceso directo a la noticia

Base estable GitHub: V3.2.12, PR #171, commit `e3fab72f9ccfdb62202b5f682cf5444fcdeab760`.

## Incidencias comunicadas
1. Cada noticia importada exigía teclear manualmente el «Titular editorial propio» y «Resumen original» para poder guardar su borrador.
2. Desde «Pendientes de revisión» o «Necesitan completar controles» de la Mesa editorial, el botón solo desplazaba al panel general, sin abrir el candidato concreto.

## Solución
- Propuesta automática gratuita basada únicamente en los metadatos recibidos del RSS. Rellena **solo los campos vacíos** al abrir una noticia pendiente; no se envía información a terceros, no se descarga contenido adicional, no se usan credenciales ni servicios de pago.
- Nuevo botón «Preparar titular y resumen automáticamente», con confirmación antes de sustituir un texto ya introducido.
- **Limitación obligatoria:** la propuesta es una plantilla preliminar, no una paráfrasis verificada ni un resumen completo del artículo. Debe revisarse y reescribirse tras leer la fuente; el sistema no marca como consultados los artículos, ni los hechos ni los derechos.
- La nota indica claramente que es una propuesta preliminar. Guardar sigue siendo manual; aprobar exige tres verificaciones confirmadas y texto original.
- Los botones de la Mesa editorial incluyen el ID del candidato. «Revisar noticia» cambia a Pendientes, carga el candidato objetivo, abre su editor y se desplaza hasta él. «Ver controles de calidad» carga y abre los controles del mismo ID.
- Los endpoints protegidos de Revisión y Calidad aceptan `?focus=<candidateId>` para priorizar ese candidato sin dejar de aplicar el filtro y los permisos admin (útil cuando hay más de 100 noticias).
- Panel de edición y detalles de calidad tienen márgenes de scroll para no quedar tapados.
- No se toca PostgreSQL, fuentes, imágenes, chat, publicaciones anteriores ni RSS. No hay publicación o aprobación automática.

## Pasos de comprobación Coolify
1. Validar CI y fusionar solo tras autorización.
2. Desplegar `main` y confirmar `/api/health` = `3.2.13`.
3. En Mesa editorial pulsar «Revisar noticia» en un candidato pendiente y verificar que aparece el editor correspondiente (no otra noticia).
4. Comprobar que el titular y el resumen provisionales se rellenan al abrir sin sobrescribir textos guardados.
5. Pulsar «Preparar titular y resumen automáticamente» sobre un texto editado: debe solicitar confirmación.
6. Volver a Mesa editorial y pulsar «Ver controles de calidad» en un candidato concreto: deben abrirse sus controles desplegados.
7. Confirmar que los checks quedan vacíos, no hay publicación automática y que las operaciones reales siguen exigiendo aprobación humana.
8. Verificar las noticias ya publicadas, incluyendo sus comentarios y fuentes.
