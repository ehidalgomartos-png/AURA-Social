'use strict';
// V3.4.6.13: guías editoriales y categorías de navegación.
// Solo páginas seleccionadas a mano. Las comparaciones enlazadas se filtran
// por el criterio SEO existente; nunca se inventan precios ni se hacen búsquedas.
const PAGES=[
 {slug:'moviles',title:'Comparar precios de móviles',subtitle:'Encuentra el teléfono adecuado sin mezclar almacenamiento, redes y estado.',
  description:'Guía para comparar precios de móviles en España: almacenamiento, 4G/5G, estado, garantía y ofertas disponibles en RedLibertad.',
  lead:'Dos teléfonos con el mismo nombre pueden tener distinta capacidad, conectividad o condición. Una comparación fiable comienza por identificar la variante exacta antes de mirar el importe más bajo.',
  keyword:/\b(?:iphone|galaxy|redmi|poco|xiaomi|smartphone|movil|telefono)\b/,
  checks:[
   ['Elige la versión exacta','Anota fabricante, modelo, versión Pro/Plus y capacidad (128 GB, 256 GB, etc.). Un teléfono de 128 GB no equivale al mismo modelo de 256 GB.'],
   ['Comprueba 4G, 5G y región','No mezcles versiones 4G y 5G. Revisa también si el anuncio describe una variante comercial distinta de la que buscas.'],
   ['Distingue nuevo de reacondicionado','El precio puede variar por el estado, la batería, los accesorios incluidos y las condiciones de garantía.'],
   ['Verifica la oferta final','Abre el enlace del vendedor para comprobar disponibilidad, envío, impuestos y posibilidad de devolución.']
  ],
  searches:['Xiaomi Redmi Note 14 Pro 256 GB 5G','Samsung Galaxy S25 256 GB','iPhone 16 128 GB'],
  faq:[['¿Por qué dos móviles con el mismo nombre cuestan diferente?','Puede cambiar la capacidad, conectividad, versión, estado, vendedor o contenido del paquete. Comprueba esos datos antes de considerar equivalentes los precios.'],
   ['¿RedLibertad vende los móviles?','RedLibertad permite comparar anuncios y ofertas guardadas. La compra y sus condiciones se gestionan con el vendedor correspondiente.']]},
 {slug:'portatiles',title:'Comparar precios de portátiles',subtitle:'Distingue procesador, memoria, gráfica y modelo antes de decidir.',
  description:'Cómo comparar portátiles: CPU, RAM, SSD, gráfica, pantalla, batería y diferentes modelos ASUS, Lenovo y otras marcas.',
  lead:'Un nombre de gama como ROG Strix o IdeaPad puede incluir equipos muy distintos. Un portátil barato solo es una buena oportunidad cuando sus componentes encajan con el uso que necesitas.',
  keyword:/\b(?:portatil|laptop|macbook|notebook|ideapad|thinkpad|rog|strix)\b/,
  checks:[
   ['Identifica el número de modelo','Comprueba la referencia completa y el año o generación cuando aparezcan. Dos portátiles de la misma serie pueden llevar componentes diferentes.'],
   ['Compara CPU, RAM y almacenamiento','Para ofimática, edición o juegos, el procesador, la memoria y el SSD influyen de forma distinta. No equipares 8 GB y 32 GB de RAM.'],
   ['Revisa gráfica y pantalla','En portátiles gaming, confirma el modelo de GPU; en todos, tamaño, resolución y características de pantalla.'],
   ['Valora estado, batería y garantía','Comprueba si es nuevo o usado, la autonomía indicada, el teclado y los servicios posventa de la tienda.']
  ],
  searches:['Portátil ASUS ROG Strix G16','Lenovo IdeaPad 16 GB RAM','MacBook Air 16 GB'],
  faq:[['¿Dos ASUS ROG Strix son el mismo portátil?','No necesariamente. G15, G16 y G17 identifican familias y tamaños que pueden tener componentes y precios distintos.'],
   ['¿Debo elegir el menor precio?','Primero confirma que estás comparando la misma configuración; después revisa envío, garantía, disponibilidad y estado.']]},
 {slug:'consolas',title:'Comparar precios de consolas',subtitle:'Encuentra consolas, diferenciando ediciones, paquetes y accesorios.',
  description:'Guía de compra de consolas PlayStation, Nintendo y Xbox: ediciones, packs, estado y precios comprobables.',
  lead:'En las búsquedas de consolas aparecen ediciones digitales, packs con juegos, mandos y productos de segunda mano. Separar estos anuncios evita interpretar un accesorio como una consola completa.',
  keyword:/\b(?:playstation|ps5|xbox|nintendo|switch|consola)\b/,
  checks:[
   ['Comprueba la edición','PlayStation 5 y PlayStation 5 Pro no son el mismo producto; Switch OLED tampoco equivale a Switch Lite.'],
   ['Separa consola sola y pack','Un paquete con juegos o accesorios puede costar más; verifica lo incluido antes de comparar su precio.'],
   ['No confundas alquiler con compra','Una cuota mensual de alquiler tecnológico no es el importe total para adquirir la consola.'],
   ['Valora estado y accesorios','Comprueba si incluye mandos y cables, y las condiciones del vendedor en unidades usadas o reacondicionadas.']
  ],
  searches:['PlayStation 5 Pro','Nintendo Switch OLED','Xbox Series X'],
  faq:[['¿Por qué una consola aparece a un precio muy bajo?','Podría tratarse de un alquiler, accesorio, anuncio usado o una edición distinta. Entra en la tienda para confirmar qué ofrece.'],
   ['¿Se comparan packs con consolas sueltas?','Conviene separarlos. Si hay un pack, evalúa por separado los extras que incluye en lugar de tratarlo como idéntico a la consola individual.']]},
 {slug:'zapatillas',title:'Comparar zapatillas por marca y modelo',subtitle:'La talla, el público y la línea importan tanto como el precio.',
  description:'Guía para comparar zapatillas Skechers, New Balance y otras marcas por modelo, talla, color, estado y envío.',
  lead:'Las familias de zapatillas suelen incluir varios colores y tallas. El precio mínimo de una talla concreta no implica que el mismo importe esté disponible en todos los números.',
  keyword:/\b(?:zapatillas|skechers|new balance|sneakers|calzado|deportivas)\b/,
  checks:[
   ['Selecciona la línea y la referencia','Skechers Go Walk, Arch Fit o New Balance 530 son referencias distintas; una búsqueda demasiado amplia reúne productos no equivalentes.'],
   ['Revisa disponibilidad de tu talla','La ficha de oferta debe permitir confirmar el número antes de comprar. Una talla agotada no es una oferta aprovechable.'],
   ['Comprueba público, horma y uso','Consulta si se anuncia para mujer, hombre o unisex y si está destinada a caminar, deporte o uso diario.'],
   ['Compara gastos de devolución','En calzado, el coste del envío y la política de cambios pueden alterar la conveniencia de una oferta.']
  ],
  searches:['New Balance 530 mujer','Skechers Go Walk mujer','Skechers Arch Fit'],
  faq:[['¿La misma zapatilla tiene siempre el mismo precio en todas las tallas?','No necesariamente. Precio y disponibilidad pueden cambiar con talla, color y vendedor.'],
   ['¿Es válido comparar colores diferentes?','Sí, para explorar una familia identificada, siempre que se indique que pueden ser variantes y se compruebe la talla concreta.']]},
 {slug:'robots-aspiradores',title:'Comparar robots aspiradores',subtitle:'Compara el robot correcto y las funciones reales de su base.',
  description:'Cómo elegir y comparar robots aspiradores: navegación, fregado, base de vaciado y versiones Roborock, Roomba o Dreame.',
  lead:'La diferencia entre un robot básico y una versión Ultra, Max o Plus puede ser importante. La estación de limpieza y el sistema de fregado también cambian el valor real de cada conjunto.',
  keyword:/\b(?:roborock|roomba|dreame|robot aspirador|robot de limpieza|aspirador)\b/,
  checks:[
   ['Distingue variantes de modelo','Un Roborock S8 no equivale automáticamente a S8+, Pro Ultra o MaxV. Comprueba el sufijo completo.'],
   ['Comprueba qué base incluye','Una estación de autovaciado o lavado puede alterar mucho el precio y el mantenimiento.'],
   ['Evalúa navegación y obstáculos','Consulta en las fichas oficiales las funciones de mapeo y detección que realmente incorpora esa versión.'],
   ['Cuenta consumibles y garantía','Bolsas, filtros, cepillos, disponibilidad de recambios y política de devolución afectan al coste de uso.']
  ],
  searches:['Roborock S8','Roborock S8 Pro Ultra','Roomba Combo'],
  faq:[['¿Por qué un Roborock de la misma serie cuesta más?','Puede incorporar una base diferente, sistemas de fregado o características que no existen en la variante básica.'],
   ['¿El comparador distingue accesorios de robots completos?','Se aplican filtros de coincidencia; aun así, comprueba siempre el título y enlace de tienda antes de pagar.']]},
 {slug:'auriculares',title:'Comparar precios de auriculares',subtitle:'Confirma generación, formato y estado antes de comprar.',
  description:'Guía para comparar auriculares Bluetooth, AirPods, Buds y modelos con cancelación de ruido por generación y garantía.',
  lead:'Las distintas generaciones de unos auriculares pueden parecerse mucho. Verificar la referencia y el estuche evita comparar productos que no ofrecen las mismas prestaciones.',
  keyword:/\b(?:airpods|auriculares|earbuds|headphones|buds|cascos)\b/,
  checks:[
   ['Identifica generación y referencia','AirPods Pro de distintas generaciones o auriculares de una misma serie no son necesariamente equivalentes.'],
   ['Distingue formato y funciones','In-ear, diadema, cancelación activa de ruido y resistencia al agua responden a usos distintos.'],
   ['Comprueba estuche y accesorios','En modelos inalámbricos, verifica si incluye el estuche de carga y si el producto es completo.'],
   ['Revisa estado e higiene','Para auriculares usados o reacondicionados, presta especial atención a condiciones, batería y garantía.']
  ],
  searches:['Apple AirPods Pro 2','Samsung Galaxy Buds3 Pro','Sony WH-1000XM5'],
  faq:[['¿Es suficiente que el anuncio diga AirPods Pro?','No. Comprueba la generación, la referencia y lo que incluye la caja.'],
   ['¿El precio más barato siempre corresponde al par completo?','No necesariamente. Puede tratarse de un estuche o repuesto: verifica el contenido exacto del anuncio.']]},
 {slug:'smartwatches',title:'Comparar precios de relojes inteligentes',subtitle:'Conectividad, tamaño y compatibilidad cambian la elección.',
  description:'Consejos para comparar smartwatch y relojes inteligentes: tamaño, GPS, LTE, compatibilidad, sensores y estado.',
  lead:'Un reloj inteligente puede venderse en varios tamaños y con o sin conexión móvil. Identifica exactamente la configuración para evitar comparar importes de versiones distintas.',
  keyword:/\b(?:smartwatch|galaxy watch|apple watch|reloj inteligente|garmin|fitbit)\b/,
  checks:[
   ['Comprueba el modelo y tamaño','El nombre de serie no basta: confirma generación, dimensiones de caja y materiales.'],
   ['Distingue Bluetooth, GPS y LTE','Las versiones con conectividad móvil tienen condiciones técnicas y de precio distintas.'],
   ['Verifica compatibilidad con tu teléfono','Consulta los requisitos de sistema de cada fabricante antes de comprar.'],
   ['Valora batería y condiciones','Revisa duración declarada, cargador incluido, estado del reloj y garantía de la tienda.']
  ],
  searches:['Samsung Galaxy Watch 7','Apple Watch Series 10','Garmin Forerunner 265'],
  faq:[['¿La versión LTE es igual que Bluetooth?','No. Puede incorporar conectividad móvil y requisitos de operador diferentes.'],
   ['¿Qué debo mirar en un reloj de segunda mano?','Comprueba estado de pantalla, batería, cargador, desbloqueo y condiciones del vendedor.']]}
];
const slugSet=new Set(PAGES.map(p=>p.slug));
if(slugSet.size!==PAGES.length)throw Error('Duplicate slug');
const HUB='/comparar/categorias';
function pathFor(slug){return HUB+'/'+slug;}
function get(slug){return PAGES.find(p=>p.slug===slug)||null;}
function matches(page,comparison){
 const text=String(comparison?.query_text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return Boolean(page?.keyword?.test(text));
}
function urlPaths(){return [HUB,...PAGES.map(p=>pathFor(p.slug))];}
module.exports={PAGES,HUB,pathFor,get,matches,urlPaths};
