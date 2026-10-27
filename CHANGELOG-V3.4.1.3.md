# V3.4.1.3 — Ver Facebook directamente, sin pulsar cada publicación

- La sección **Cuenta → Publicaciones de Facebook** incorpora una preferencia desactivada por defecto: «Mostrar automáticamente las publicaciones públicas de Facebook».
- Cuando una persona la activa expresamente, los posts públicos canónicos de Facebook se muestran en el muro conforme entran en la zona visible de la pantalla, sin pulsar individualmente «Ver publicación aquí». Se conserva el enlace para abrir el original.
- Al desactivar la preferencia, los visores cargados automáticamente se eliminan de la vista y vuelven las tarjetas habituales. Los clics manuales siguen disponibles.
- Se advierte antes de activar que Facebook puede recibir datos del navegador (IP, cookies, etc.). La preferencia se guarda **solo en el navegador y por cuenta**, no se impone a otros usuarios o dispositivos.
- La carga es diferida por IntersectionObserver, limitada a un máximo de seis publicaciones externas automáticas por visita; el resto mantienen el control manual para no ralentizar Inicio.
- **No** se cargan automáticamente enlaces cortos que no admiten visor, publicaciones bloqueadas, borradores, Instagram, X, TikTok ni YouTube. En navegadores sin IntersectionObserver permanece el botón manual.
- No se descargan medios externos al VPS, no se usan cookies de terceros en los componentes previos al consentimiento, y no cambian permisos, publicaciones, mensajes ni datos de PostgreSQL.
- Se añade JS propio a la caché PWA, versionado de recursos HTML y CSS, y pruebas de consentimiento, revocación, segmentación por cuenta, carga visible, límites y no regresión.

## Limitaciones
- Los posts que Facebook no permita insertar (privados, borrados o restringidos) seguirán sin poder mostrarse aunque se active la opción.
- La activación automática no reproduce vídeos con sonido de forma automática; se muestra el plugin de Facebook, que conserva sus propias reglas de reproducción.
- La preferencia es local al dispositivo; no equivale a una preferencia sincronizada del servidor.
