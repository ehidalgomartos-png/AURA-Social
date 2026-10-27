# V3.4.1.6 — Visor de fotografías cómodo en móvil

Problema observado: tras abrir una fotografía horizontal, se veía una franja de imagen relativamente pequeña centrada en un gran panel oscuro con bordes. Aunque se preservaba la proporción, no había forma cómoda de examinar detalles.

- Se elimina el marco oscuro visible y se adapta el visor a toda la pantalla, con un fondo translúcido que desenfoca el contenido anterior y sin bordes de tarjeta.
- La imagen continúa mostrándose **completa y sin recortar** de forma predeterminada. Una foto panorámica seguirá siendo horizontal; no se deforma ni se inventa resolución.
- Se incorpora el control «Ampliar foto ×2 / Ajustar foto», también accesible tocando la imagen. En ampliación es posible desplazarla por la pantalla con el movimiento normal del dedo, manteniendo su proporción.
- El visor tiene espacio reservado para controles, respeta áreas seguras de Android e iOS y dispone de botón X, Escape, y cierre tocando fuera. Al cerrar limpia la imagen, restablece zoom y devuelve el foco.
- Reutiliza únicamente la URL ya autorizada y visible. No altera permisos, fotografías, almacenamiento local ni endpoints.
- Se actualiza el versionado CSS/JS para evitar que el navegador utilice la versión anterior y se añaden pruebas de zoom, restablecimiento, acceso y diseño móvil.

Sin cambios en PostgreSQL, notificaciones, autenticación, publicaciones, monetización ni visor de Facebook.
