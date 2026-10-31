# V3.6.45 — Explora RedLibertad

## Diseño aprobado: mapa visual de servicios

**Ruta canónica:** `/explorar`  
**Alias:** `/servicios` (redirige a la canónica)  
**Título visible:** Todo RedLibertad, en un solo lugar.  
**Descripción:** Un espacio para ayudar, informarte, compartir, descubrir personas y tomar mejores decisiones.

### Objetivo
Una portada de herramientas que explique en pocos segundos para qué sirve RedLibertad. No es un mapa geográfico ni una pantalla de venta. Está orientada a personas que buscan una acción y no conocen los nombres de las secciones.

### Maquetación
1. **Cabecera compacta:** logotipo, Servicios, Resuelve, Marketplace y Entrar en mi espacio. En móvil se simplifica sin crear una barra inferior nueva.
2. **Hero azul marino / verde azulado:** título, breve descripción, dos acciones y mapa ornamental de cuatro nodos (Ayuda, Infórmate, Compara, Conecta) alrededor de RedLibertad.
3. **Qué te gustaría hacer hoy:** seis accesos por intención, no por nomenclatura interna: Necesito ayuda, Quiero ayudar, Quiero informarme, Comprar o vender, Comparar productos y Conectar con personas.
4. **Buscador de servicios:** filtro local por nombre, descripción y palabras asociadas, tolerante a tildes. No manda la búsqueda a servidores, no requiere login y no se registra.
5. **Catálogo completo:** tarjetas con pictograma, nombre, descripción y enlace, agrupadas en cuatro áreas. Contiene 17 enlaces reales y disponibles en el código.
6. **Cómo se conecta todo:** texto que explica relación entre resolver, escribir, comprar y crear comunidad.
7. **Pie:** información y enlaces legales.

### Áreas
- **Ayuda entre personas:** Resuelve, ayudar a otras personas, soluciones revisadas.
- **Información y conocimiento:** Noticias, Voces Independientes, artículos publicados y guías.
- **Compras y comparaciones:** Marketplace, Comparador de precios y tiendas participantes.
- **Tu comunidad:** personas, comunidades, publicaciones, Reels, eventos, buscador, mi espacio y mensajes.

### Guía visual
- Fondo muy claro, tarjetas blancas con bordes suaves y esquinas redondeadas.
- Hero en marino `#102f42` con verde `#95e0d4`.
- Pictogramas lineales, cada área con un tono secundario (verde, azul, lila, arena).
- Distancias generosas, pero con una sola columna de tarjetas en móviles de 600 px o menos.
- Entradas por intención en dos columnas móviles, pasando a una bajo 355 px.
- En ordenador 3 columnas de tarjetas y mini-mapa decorativo dentro del hero.
- Elementos clicables de al menos 44-48 px, foco visible y opción de movimiento reducido.
- Sin métricas de usuarios, opiniones ni calificaciones fabricadas.

### SEO y navegación
- `/explorar` indexable, canonical propio, metadatos y Open Graph.
- Añadido al sitemap público y robots.
- Acceso desde la portada principal, la navegación lateral de RedLibertad y su vista Explorar; sin sobrecargar el dock inferior del móvil.
- Los servicios que requieren cuenta enlazan a su espacio existente, sin dar a entender que la sesión ya está iniciada.

### Pruebas
- Existencia y unicidad de las 17 tarjetas.
- Enlaces internos válidos.
- GET de `/explorar` y redirección `/servicios`.
- Buscador tolerante a tildes y control de cero resultados.
- SEO, teclado, foco, móvil y enlaces desde la aplicación.
- Ejecución de GitHub Actions JavaScript y PostgreSQL 18 antes de fusionar.

## Próximo roadmap
- **V3.6.46 — Integración y descubrimiento:** mejorar la navegación de los servicios desde otras pantallas, manteniendo el menú móvil compacto.
- **V3.6.46.1 — UX y observabilidad:** comprobar rutas rotas, desplegados y accesos fallidos en producción, sin presentar cifras no verificadas.
- **V3.6.47 — Voces Independientes:** mejorar legibilidad, fuentes y navegación entre autores.
- **V3.6.47.1 — Resuelve:** continuar facilitando seguimiento y lectura de respuestas reales.

El despliegue de Coolify y las capturas reales en varios dispositivos son verificaciones distintas de la fusión en GitHub.
