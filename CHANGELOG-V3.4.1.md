# V3.4.1 — Enlaces de Facebook, Instagram, X y TikTok en las publicaciones

- En «Crear publicación», pegar un enlace de una publicación pública en Facebook, Instagram, X o TikTok muestra una tarjeta antes de publicar. Mantiene el flujo previo de YouTube y evita añadir campos nuevos.
- Los enlaces incluidos en textos publicados también generan tarjetas compactas. Si el mensaje contiene únicamente el enlace, no lo repite visualmente dos veces, pero conserva el texto original almacenado.
- El contenido externo se carga únicamente tras pulsar **Ver aquí**. Facebook y TikTok utilizan reproductores del proveedor; Instagram y X utilizan sus widgets oficiales cargados después del clic. Siempre existe el enlace **Abrir en…** cuando el proveedor limita la inserción.
- Reconoce enlaces canónicos de publicaciones/Reels/fotos y enlaces cortos habituales de Facebook y TikTok. Estos últimos aparecen como enlaces compartidos sin fingir que podemos conocer su ID de vídeo, ni seguir redirecciones ni pedir permisos de API.
- La detección de URLs valida HTTPS, dominios exactos y rutas de contenidos; elimina parámetros de seguimiento, rechaza credenciales, puertos, traversal y URLs manipuladas.
- Se conservan las restricciones previas de YouTube, la privacidad de contenido restringido, las audiencias privadas, el modo Reel y el flujo de ficheros propios. No se duplican medios en el VPS.
- Los permisos CSP se amplían solo a los proveedores que se cargarán tras el clic, y el nuevo archivo JS propio se incluye en el precache público de PWA.
- Pruebas en GitHub Actions sobre parser, seguridad, previsualización, comportamiento al activar, PWA, interfaz y CSP.
- **Limitación explícita:** no se obtienen miniaturas ni textos verificados para estas cuatro redes, ya que su disponibilidad depende de las reglas y APIs de los proveedores. Las previsualizaciones muestran plataforma y tipo de publicación; los mensajes privados, borrados o sin autorización de inserción pueden requerir abrir la red original. No se afirma compatibilidad universal.

**Sin** cambios de esquema PostgreSQL, cuentas ficticias, actividad automática, correos masivos ni pagos. La auditoría operativa de backups prevista para crecimiento sigue siendo una tarea aparte.
