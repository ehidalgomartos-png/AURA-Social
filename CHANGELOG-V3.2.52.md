# RedLibertad V3.2.52 — Marketplace: borrar, fotos múltiples, cámara y sesión

Base estable: V3.2.51.3, main commit dccebab60fa1a110c525a448979f7e49875dfaf9.

## 1. Eliminar anuncios
- La operación DELETE ya existía, restringida en el backend a seller_id = usuario autenticado. Se hace más visible en «Mis anuncios» como «Eliminar anuncio».
- Confirmación con el título del anuncio y explicación de que desaparece del Marketplace y sitemap, sin borrados accidentales.
- Mensaje de resultado; el listado se actualiza sin recargar la página. No se borra la foto del almacenamiento automáticamente para evitar eliminar multimedia compartida.

## 2. Fotografías de galería
- Selección de varias imágenes JPG/PNG/WebP, máximo seis en total y 15 MB por foto.
- Permite añadir otras tandas sin sustituir las seleccionadas previamente; muestra miniaturas y el contador total antes de publicar.
- Permite quitar las fotos nuevas y las existentes durante la edición (solo se confirma al guardar).
- Si falla una subida, las fotos ya subidas permanecen asociadas a la preparación del anuncio; solo se reintentan las pendientes.

## 3. Cámara móvil
- Botón «Hacer foto» asociado a input capture=environment, para usar la cámara trasera cuando el dispositivo/navegador lo soporte.
- Cada foto tomada se incorpora a la misma cola, y se pueden tomar varias una por una.
- Formatos aceptados: JPG, PNG, WebP. Si el dispositivo produce HEIC, muestra un mensaje claro porque el servidor actual no admite ese formato.

## 4. Sesión
- El botón Publicar comienza desactivado mientras se comprueba la sesión.
- Sin sesión, deja de abrir el formulario y se transforma en «Inicia sesión para publicar», con enlace y explicación; el catálogo público sigue accesible.
- Si caduca durante la edición o subida, se bloquea el guardado y aparece enlace para volver a iniciar sesión.
- Si no se puede comprobar la sesión por red, ofrece Reintentar, sin confundir fallo de red con una cuenta desconectada.

## Cobertura y despliegue
- Test de sintaxis del cliente, adición por tandas, límite seis fotos, formatos/tamaños, protección de acciones, borrado restringido y versiones.
- CI incluye npm run test:marketplace-media y las regresiones actuales.
- No hay cambios en la base de datos ni borrado de anuncios existentes.

## Comprobaciones reales tras deploy
1. Ver /api/health version 3.2.52.
2. Entrar sin sesión en /marketplace: no debe abrirse el formulario, y debe ofrecer inicio de sesión y catálogo público.
3. Iniciar sesión; abrir Mis anuncios, eliminar uno de prueba con confirmación y comprobar desaparición del sitemap. NO borrar la taza real.
4. Crear un anuncio de prueba con dos fotos de galería y otra desde cámara móvil. Previsualizar y quitar una antes de guardarlo.
5. Comprobar ficha pública, fotos, precio y página de Mis anuncios.

**No fusionar sin autorización expresa del usuario.**
