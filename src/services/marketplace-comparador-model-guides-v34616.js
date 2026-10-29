'use strict';
// V3.4.6.16 — guías editoriales de modelos concretos: selección manual.
// Cada URL aporta criterios distintos. Sin precios, stock, puntuaciones ni datos inventados.
const HUB='/comparar/guias';
const GUIDES=[
 {slug:'xiaomi-redmi-note-14-pro',category:'moviles',
  title:'Xiaomi Redmi Note 14 Pro: cómo comparar versiones y precios',
  description:'Guía de compra del Xiaomi Redmi Note 14 Pro: cómo distinguir versiones 4G/5G, memoria, capacidad, estado y ofertas sin mezclar variantes.',
  intro:'El nombre Redmi Note 14 Pro puede aparecer en anuncios de distintas versiones de conectividad, memoria y almacenamiento. Antes de ordenar ofertas por precio, conviene confirmar que todas describen el teléfono que realmente quieres comprar.',
  key:'Xiaomi Redmi Note 14 Pro',
  terms:['xiaomi redmi note 14 pro','redmi note 14 pro'],
  avoid:/\b(?:pro\s*\+|pro\s+plus)\b/,
  variants:[
   ['Red 4G y 5G','Los anuncios pueden indicar 4G o 5G; no se deben interpretar como una única versión. Si el título omite la red, conviene comprobar la ficha oficial antes de compararlo.'],
   ['Almacenamiento','No mezcles precios de 128 GB, 256 GB y 512 GB: confirma la capacidad indicada y si existe una configuración distinta de memoria RAM.'],
   ['Pro frente a Pro+','La palabra “Pro” no significa “Pro+”. El signo + o “Plus” cambia el modelo y puede modificar características y precio.']],
  checks:[
   ['Copia la referencia exacta','Verifica en la tienda modelo, capacidad, conectividad y variante de mercado. Una coincidencia parcial del título no es suficiente.'],
   ['Confirma condición y garantía','Comprueba si se ofrece nuevo, usado o reacondicionado, además de la política de devolución y el vendedor que responde por la compra.'],
   ['Verifica el coste real','El importe anunciado puede excluir envío u otros gastos. Abre la web del comercio y confirma que el artículo sigue disponible.']],
  searches:['Xiaomi Redmi Note 14 Pro 256 GB 5G','Xiaomi Redmi Note 14 Pro 256 GB 4G'],
  faq:[['¿Puedo comparar un Redmi Note 14 Pro 4G con uno 5G?','Puedes evaluarlos como alternativas, pero no sumarlos como si fueran ofertas de una única variante. La conectividad debe aparecer de forma clara.'],
   ['¿Una oferta que no indica capacidad es comparable?','Primero conviene comprobar el almacenamiento en el anuncio o ficha del comercio. Si el dato no está disponible, no se puede confirmar que el precio corresponda al mismo teléfono.']]},
 {slug:'playstation-5-pro',category:'consolas',
  title:'PlayStation 5 Pro: comprar o alquilar y comparar ofertas',
  description:'Guía para comparar la PlayStation 5 Pro: compra frente a alquiler, consola o packs, diferencias con PS5 y condiciones de tiendas.',
  intro:'Al buscar una PlayStation 5 Pro pueden aparecer consolas completas, packs, alquileres y productos de segunda mano. Aunque compartan palabras en el título, no son precios equivalentes. Esta guía ayuda a separar el tipo de oferta antes de elegir.',
  key:'PlayStation 5 Pro',
  terms:['playstation 5 pro','ps5 pro'],
  avoid:/\b(?:slim|portal)\b/,
  variants:[
   ['PS5 y PS5 Pro','La PS5 estándar no es la PS5 Pro. Antes de comprar, confirma el modelo real del anuncio y comprueba qué componentes incluye.'],
   ['Compra o alquiler','Una cuota periódica de alquiler no es el precio de propiedad de la consola. Compara por separado duración, coste total y condiciones de devolución.'],
   ['Consola individual o pack','Un anuncio que incluye juegos, mandos o accesorios puede tener otro precio. No compares un pack como si fuera la consola sin extras.']],
  checks:[
   ['Comprueba la modalidad','Busca las palabras comprar, alquiler, mensual o suscripción. Confirma si el importe es único o recurrente.'],
   ['Valora el estado','Si se trata de un anuncio de segunda mano, verifica funcionamiento, mando, accesorios, garantía y posibles limitaciones.'],
   ['Revisa las condiciones finales','Antes de pagar, comprueba gastos de entrega, plazos, devoluciones, identidad del vendedor y disponibilidad.']],
  searches:['PlayStation 5 Pro','Sony PS5 Pro consola'],
  faq:[['¿Por qué una PS5 Pro puede anunciarse por una cantidad muy inferior a otras?','Puede ser una cuota de alquiler, un accesorio, una consola usada o un anuncio incompleto. Verifica qué se obtiene por ese importe.'],
   ['¿El comparador es la tienda que vende la consola?','No. RedLibertad facilita la comparación; la compra o el alquiler y sus condiciones se formalizan con el proveedor.']]},
 {slug:'new-balance-530',category:'zapatillas',
  title:'New Balance 530: compara precios, tallas y colores',
  description:'Guía para comprar New Balance 530: diferencias entre tallas y colores, versiones de mujer y unisex, disponibilidad y devoluciones.',
  intro:'Las New Balance 530 se ofrecen en múltiples combinaciones de color y tallas. Dos anuncios pueden referirse a la misma familia de zapatillas y, aun así, no representar la misma variante disponible para tu pie.',
  key:'New Balance 530',
  terms:['new balance 530'],
  avoid:/\b(?:574|327|9060)\b/,
  variants:[
   ['Talla exacta','Una oferta barata no sirve si la talla está agotada. Comprueba el número en la tienda y no supongas que todas las tallas cuestan lo mismo.'],
   ['Color y referencia','Los acabados pueden tener disponibilidades diferentes. Si deseas un color concreto, comprueba la referencia y las fotografías reales del vendedor.'],
   ['Mujer, hombre o unisex','El etiquetado comercial puede variar. Revisa la tabla de medidas y las condiciones del fabricante para elegir una talla adecuada.']],
  checks:[
   ['Comprueba el modelo','Asegúrate de que el título corresponde a New Balance 530, no a la 574 ni a otra silueta de la marca.'],
   ['Valora devolución y gastos','El coste de devolver o cambiar una talla puede hacer menos interesante un precio inicial bajo.'],
   ['Confirma estado y autenticidad','Compra en comercios fiables y revisa la identificación del vendedor, el estado anunciado y los métodos de pago.']],
  searches:['New Balance 530 mujer','New Balance 530 unisex'],
  faq:[['¿El precio mostrado vale para cualquier talla?','No necesariamente. Comprueba talla y color en el comercio; la disponibilidad y el precio pueden cambiar entre variantes.'],
   ['¿Puedo comparar las 530 con distintas combinaciones de color?','Sí, como familia de producto identificada, siempre dejando claro que no son el mismo artículo exacto.']]},
 {slug:'asus-rog-strix',category:'portatiles',
  title:'ASUS ROG Strix: G15, G16 y G17 no son el mismo portátil',
  description:'Guía para comparar ASUS ROG Strix G15, G16 y G17: procesador, gráfica, RAM, SSD, pantalla, generaciones y precios.',
  intro:'ASUS ROG Strix identifica una familia de portátiles para videojuegos y otros usos exigentes. Los nombres G15, G16 o G17 no bastan para conocer el rendimiento: una misma gama puede incluir configuraciones de hardware distintas.',
  key:'ASUS ROG Strix',
  terms:['asus rog strix','portatil asus rog strix','rog strix gaming'],
  avoid:/\b(?:raton|mouse|teclado|keyboard|funda)\b/,
  variants:[
   ['Número de modelo y generación','G15, G16 y G17 identifican modelos diferentes; además pueden existir revisiones y generaciones en cada familia.'],
   ['Tarjeta gráfica y procesador','La GPU y la CPU suelen afectar más a videojuegos y edición que el nombre comercial de la serie. Compara sus referencias exactas.'],
   ['RAM, SSD y pantalla','Revisa tamaño de memoria, almacenamiento y características de pantalla; dos portátiles de igual apariencia pueden rendir distinto.']],
  checks:[
   ['Busca la referencia de fabricante','La denominación completa del modelo permite evitar confusiones al cotejar distintas tiendas.'],
   ['Elige en función de tu uso','Define si necesitas autonomía, portabilidad, edición o juegos antes de priorizar una configuración concreta.'],
   ['Revisa garantía y distribución','Comprueba distribución del teclado, estado, garantía, envío y posibles accesorios añadidos.']],
  searches:['Portátil ASUS ROG Strix G16','Portátil ASUS ROG Strix G17'],
  faq:[['¿El ROG Strix G16 más barato siempre es el mejor?','No. Su precio depende de CPU, GPU, memoria, pantalla, estado y generación. Debes comparar configuraciones similares.'],
   ['¿Puedo comparar G15 y G17?','Puedes contrastarlos como alternativas, pero no deben aparecer como ofertas idénticas de un único portátil.']]},
 {slug:'roborock-s8',category:'robots-aspiradores',
  title:'Roborock S8: diferencias entre el modelo base, Plus y Ultra',
  description:'Guía de compra del Roborock S8: cómo distinguir el aspirador base de versiones Plus, Pro, Ultra y Max, bases y accesorios.',
  intro:'La familia Roborock S8 puede incluir equipos y bases muy diferentes. Un precio bajo podría corresponder al aspirador sin estación avanzada, a un accesorio o a una versión distinta de la que buscas.',
  key:'Roborock S8',
  terms:['roborock s8','robot aspirador roborock s8'],
  avoid:/\b(?:roborock s7|roborock q)\b/,
  variants:[
   ['Roborock S8 básico','Antes de comparar, verifica si el anuncio ofrece el robot solo y qué accesorios incorpora de serie.'],
   ['Versiones Plus, Pro, Ultra o Max','No supongas que los sufijos nombran el mismo aparato. Comprueba funciones de la estación y del robot en la ficha del vendedor.'],
   ['Robot y base de limpieza','Los conjuntos con vaciado, lavado u otras funciones pueden tener un coste diferente del modelo sin esa base.']],
  checks:[
   ['Confirma el nombre completo','Un anuncio S8 Pro Ultra o S8+ no debe etiquetarse como oferta idéntica del S8 básico.'],
   ['Revisa los consumibles','Comprueba coste y disponibilidad de filtros, cepillos y bolsas, según los accesorios de la versión.'],
   ['Comprueba estado y garantía','Verifica si el robot y su base están completos, además del estado de sensores, batería y política de devolución.']],
  searches:['Roborock S8','Roborock S8 Pro Ultra'],
  faq:[['¿Por qué hay tanta diferencia entre los precios S8?','Puede deberse a versiones del robot, estaciones incluidas, accesorios, estado y promociones. Comprueba siempre la denominación completa.'],
   ['¿El precio incluye la base?','No se puede asumir. Consulta en la tienda la descripción y el contenido del paquete.']]}
];
const slugs=new Set(GUIDES.map(x=>x.slug));
if(slugs.size!==GUIDES.length)throw Error('Guías duplicadas');
function get(slug){return GUIDES.find(x=>x.slug===slug)||null;}
function pathFor(slug){return HUB+'/'+slug;}
function urlPaths(){return [HUB,...GUIDES.map(x=>pathFor(x.slug))];}
function matches(guide,row){
 const text=String(row?.query_text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return guide.terms.some(term=>text.includes(term))&&!guide.avoid.test(text);
}
module.exports={HUB,GUIDES,get,pathFor,urlPaths,matches};
