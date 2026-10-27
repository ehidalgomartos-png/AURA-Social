# V3.4.1.2 — Visor Facebook adaptado a móvil y ordenador

- Tras pulsar **Ver publicación aquí**, el visor de Facebook utiliza el ancho real disponible (limitado a 500 px), en vez de pedir siempre 500 px y mostrar grandes franjas laterales o contenido cortado en móvil.
- Se aumenta de forma acotada la altura del iframe de Facebook para reducir el recorte de la parte inferior del post, sin forzar un tamaño infinito ni hacer solicitudes externas automáticamente.
- El contenido de Facebook queda centrado en ordenador. El enlace **Abrir publicación original** siempre permanece disponible debajo.
- Se mantienen la carga solo tras clic, validación estricta HTTPS, otras redes, YouTube, privacidad de las audiencias y las reglas CSP existentes.
- Se renuevan parámetros de versión de HTML/CSS/JS y se añade una prueba automatizada de anchos de móvil y escritorio y de no regresión en TikTok.
- Los contenidos largos, privados o limitados por Facebook siguen sujetos a las dimensiones y políticas de su plugin; no se puede acceder al interior de un iframe de otro dominio para medirlo con precisión.

Sin cambios de base de datos, correos, usuarios, monetización o publicaciones guardadas.
