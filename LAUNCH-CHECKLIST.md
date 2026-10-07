# RedLibertad V1.70 — Launch Readiness Checklist

## 1. Código y despliegue
- `main` debe apuntar a V1.70.0 o superior.
- Ejecutar `npm run check:syntax`.
- Coolify debe usar `/api/ready` como healthcheck.
- `/api/health` debe mostrar `version:"1.70.0"` y `configuration.criticalReady:true`.
- `/api/ready` debe responder HTTP 200 y `database:"ready"`.

## 2. Configuración
- `DATABASE_URL` configurada y apuntando a la base correcta.
- `JWT_SECRET` largo, aleatorio y privado.
- En producción: `APP_ORIGIN` con HTTPS y `COOKIE_SECURE=true`.
- Si `MEDIA_STORAGE=local`, `UPLOAD_DIR` debe estar montado en almacenamiento persistente.
- Si Web Push está habilitado, las tres variables VAPID deben estar configuradas.

## 3. Backups y rollback
- Backup reciente de PostgreSQL verificado.
- Backup reciente del volumen de multimedia.
- Conservar el commit estable anterior para rollback.
- No borrar datos, volúmenes ni la base durante una reversión de aplicación.

## 4. Smoke test de usuario
- Registro +18.
- Login y cierre de sesión.
- Editar perfil y avatar.
- Feed Para ti / Siguiendo / Cercanas / Nuevo / VIP.
- Crear post de texto, imagen y vídeo.
- Likes, comentarios, guardados, republicación y compartir.
- Stories y Reels.
- Seguir/dejar de seguir y perfiles.
- Mensajes 1:1 y grupos.
- Respuestas, reacciones, presencia y recibos de lectura.
- Notificaciones y deep links.
- Comunidades y eventos.
- Colaboraciones y consentimientos.
- Centro de confianza, bloqueos, silencios y reportes.
- Administración/moderación.
- Panel Beta real: métricas agregadas cargan correctamente.
- Abrir Ayuda y feedback desde escritorio y desde Perfil en móvil.
- Enviar un Problema, una Sugerencia y una Duda de prueba.
- Confirmar que el usuario ve el estado de sus propios envíos.
- Confirmar que administración puede revisar, resolver, reabrir y añadir una nota visible.
- Crear una cohorte beta de prueba y añadir/quitar un usuario.
- Crear una feature flag de prueba limitada a cohortes.
- Verificar que un usuario fuera de la cohorte recibe la función desactivada.
- Verificar que un usuario dentro de la cohorte recibe la función activada.
- Probar el kill switch global y confirmar que prevalece sobre cualquier cohorte.
- Confirmar que cada cambio de feature/cohorte aparece en el historial con administrador y fecha.
- Cambiar una feature, usar “Restaurar estado anterior” y comprobar que vuelve exactamente a su configuración previa.
- Cambiar después esa misma feature otra vez e intentar restaurar una entrada antigua: debe bloquearse con conflicto.
- Añadir/quitar un miembro de cohorte y verificar que el rollback restaura la lista anterior.
- Confirmar que un rollback crea su propia entrada de auditoría.
- Probar `support_center`: apagarlo, comprobar que desaparece/queda bloqueado, y reactivarlo.
- Verificar que el contexto de soporte no contiene cuerpos de mensajes, posts ni archivos.
- Registrar una incidencia operativa, pasarla a seguimiento, resolverla y reabrirla.
- Confirmar que el panel muestra health/readiness sin exponer secretos.

## 5. Smoke test móvil
- iPhone/Safari y Android/Chrome si están disponibles.
- Bottom nav no tapa contenido ni formularios.
- Teclado virtual no tapa el compositor del chat.
- Modales/bottom sheets permiten llegar al último control.
- Subida de foto/vídeo funciona desde cámara/galería.
- Safe areas correctas en dispositivos con notch.
- PWA abre y actualiza correctamente.

## 6. Observabilidad
- Los errores API devuelven un `X-Request-Id` / `requestId`.
- Revisar logs ante respuestas 5xx o peticiones superiores a 1,5 s.
- No registrar cuerpos de mensajes, contraseñas, tokens ni multimedia privada.

## 7. Criterio de salida
Lanzar a más usuarios solo cuando health/readiness sean correctos, los smoke tests críticos pasen y exista un backup recuperable. La monetización permanece fuera de alcance.


## 8. Operación durante la beta
- Revisar el panel **Beta real** al inicio y al final de cada jornada de pruebas.
- Registrar una incidencia crítica si una función esencial deja de estar disponible para varios usuarios.
- No usar las métricas agregadas para perfilar personas individualmente.
- La tasa de activación es una señal de producto, no un objetivo para introducir presión, rachas o notificaciones compulsivas.
- Resolver una incidencia solo después de repetir el smoke test de la función afectada.


## 9. Privacidad del soporte beta
- El soporte solo debe guardar el texto que el usuario decide enviar.
- El contexto automático permanece limitado a información técnica básica y no incluye contenido social privado.
- No usar feedback individual para ranking, publicidad, recomendaciones ni perfilado.
- Usar el request ID únicamente para diagnóstico operativo.


## 10. Release control durante la beta
- Crear una feature flag antes de exponer una función experimental a usuarios.
- Empezar con `default_enabled=false` y asignar una cohorte pequeña cuando la novedad necesite validación.
- Usar el kill switch ante errores funcionales, de seguridad o rendimiento; no hace falta retirar todo el despliegue.
- Pausar una cohorte conserva sus miembros para poder reanudarla después.
- Antes de activar una función para todos, repetir los smoke tests con al menos una cohorte beta.
- Probar una ola Piloto 5% y verificar que la asignación del mismo usuario permanece estable entre sesiones.
- Subir una función 5% → 25% → 50% y comprobar que no pierde acceso quien ya estaba dentro.
- Congelar expansión y verificar que no se puede cambiar de porcentaje hasta reanudarla.
- Con la expansión congelada, comprobar que el kill switch global sigue apagando la función.
- Graduar al 100% y confirmar que usuarios fuera de cohortes reciben la función.
- Usar el rollback V1.74 para volver de una ola superior a una inferior y confirmar la restauración.


## 11. Rollback seguro de release control
- Usa el rollback de configuración para feature flags y cohortes; no sustituye al rollback de código o base de datos.
- Si aparece `rollback_conflict`, no fuerces la restauración: revisa primero los cambios posteriores.
- Las creaciones de nuevas features/cohortes se auditan pero no se eliminan automáticamente.
- Antes de un cambio amplio de cohortes, comprueba que el historial reciente es legible y que el healthcheck está correcto.


## 12. Criterios para graduar una función
- Empezar en cohortes o Piloto 5–10% cuando el riesgo funcional sea relevante.
- Pasar a Beta ampliada solo después de smoke tests correctos y ausencia de incidencias críticas abiertas relacionadas.
- Congelar la expansión ante regresiones, rendimiento anómalo o feedback repetido antes de usar el kill switch.
- Usar el kill switch cuando la función cause daño funcional, de seguridad o disponibilidad.
- Graduar al 100% solo cuando la función ya no necesite validación por cohortes/olas.


## 13. Dominio canónico y lanzamiento público
- Abrir `https://redlibertad.com` y comprobar HTTPS sin avisos.
- Abrir `https://www.redlibertad.com` y confirmar redirección al dominio sin www.
- Confirmar `/api/public-config` con `origin:"https://redlibertad.com"`.
- Confirmar `/robots.txt` con sitemap en el dominio canónico.
- Confirmar `/sitemap.xml` y revisar que no incluye posts sensibles.
- Compartir un post, perfil e invitación y verificar que todos los enlaces empiezan por `https://redlibertad.com`.
- Abrir un post público normal y revisar canonical/OG.
- Abrir un post sensible público y confirmar que la vista externa está protegida y marcada noindex.
- Instalar/abrir la PWA y verificar que sigue asociada a la aplicación tras el cambio de dominio.


## 14. Perfiles públicos y SEO
- Abrir un perfil descubrible en `/perfil/usuario` y confirmar canonical en `redlibertad.com`.
- Compartir un perfil desde la app y confirmar que el enlace usa `/perfil/usuario`.
- Verificar Open Graph/Twitter Card con avatar o imagen por defecto.
- Confirmar Structured Data `Person` en un perfil descubrible.
- Desactivar `discoverable` en una cuenta de prueba y confirmar `noindex,nofollow`.
- Confirmar que un perfil no descubrible no aparece en `/sitemap-profiles.xml`.
- Confirmar que cuentas admin/inactivas no aparecen en el sitemap de perfiles.
- Revisar `robots.txt` y confirmar las dos líneas Sitemap.


## 15. Directorio público y SEO hub
- Abrir `/perfiles` y confirmar que solo muestra perfiles descubribles.
- Buscar con `/perfiles?q=...` y confirmar `noindex,follow`.
- Probar paginación y enlaces Anterior/Siguiente conservando la búsqueda.
- Confirmar que perfiles admin, inactivos o `discoverable=false` no aparecen.
- Abrir una tarjeta del directorio y confirmar navegación a `/perfil/usuario`.
- Confirmar que la portada enlaza a **Personas**.
- Revisar `/sitemap-index.xml` y confirmar referencias a `/sitemap.xml` y `/sitemap-profiles.xml`.
- Confirmar que `/sitemap.xml` incluye `/perfiles`.
- Confirmar que `robots.txt` anuncia el sitemap índice.


## 16. Publicaciones públicas y hashtags SEO
- Abrir `/publicaciones` y confirmar que solo aparecen posts públicos normales de autores descubribles.
- Buscar con `/publicaciones?q=...` y confirmar `noindex,follow`.
- Probar paginación y enlaces Anterior/Siguiente.
- Abrir un hashtag desde una publicación y confirmar `/hashtag/tag`.
- Confirmar que un hashtag con menos de 2 posts queda `noindex,follow`.
- Confirmar que contenido sensible no aparece en `/publicaciones`, hashtags ni sitemaps.
- Poner `discoverable=false` en un autor de prueba y confirmar que sus posts desaparecen del hub/sitemaps.
- Abrir directamente uno de sus posts públicos y confirmar que sigue accesible pero queda `noindex,nofollow`.
- Revisar `/sitemap-hashtags.xml`.
- Confirmar que `/sitemap-index.xml` referencia posts, perfiles y hashtags.
- Confirmar que `/sitemap.xml` incluye `/publicaciones`.
- Confirmar enlaces cruzados Portada ↔ Personas ↔ Publicaciones.


## 17. Comunidades públicas y SEO
- Abrir `/comunidades` y confirmar que solo aparecen comunidades públicas con propietario activo, no-admin y descubrible.
- Buscar con `/comunidades?q=...` y confirmar `noindex,follow`.
- Probar paginación y enlaces Anterior/Siguiente conservando la búsqueda.
- Abrir una comunidad y confirmar URL canónica `/comunidad/:id/:slug`.
- Probar una URL sin slug o con slug antiguo y confirmar redirección 301 a la canónica.
- Confirmar que una comunidad privada devuelve 404 en la capa pública.
- Confirmar que la ficha pública nunca muestra posts sensibles/desnudez, retirados ni posts de perfiles no descubribles.
- Poner `discoverable=false` al propietario de una comunidad pública y confirmar que desaparece de directorio/sitemap y la ficha directa queda `noindex,nofollow`.
- Revisar `/sitemap-communities.xml` y confirmar que solo contiene comunidades elegibles.
- Confirmar que `/sitemap-index.xml` referencia el sitemap de comunidades.
- Confirmar que `/sitemap.xml` incluye `/comunidades`.
- Revisar `robots.txt` y confirmar `/comunidades`, `/comunidad/` y el nuevo sitemap.
- Confirmar enlaces cruzados Portada ↔ Personas ↔ Publicaciones ↔ Comunidades.


## 18. Eventos públicos y SEO
- Abrir `/eventos` y confirmar que solo aparecen eventos `visibility=public`.
- Crear eventos de prueba `connections`, `circles` y `community` y confirmar que no aparecen en la capa pública.
- Confirmar que un evento cancelado desaparece del directorio y del sitemap público.
- Buscar con `/eventos?q=...` y confirmar `noindex,follow`.
- Filtrar con `?tipo=in_person` y `?tipo=online` y confirmar `noindex,follow`.
- Probar paginación y canonical del directorio.
- Abrir un evento en `/evento/:id/:slug` y confirmar canonical.
- Probar URL sin slug o con slug antiguo y confirmar redirección 301.
- Confirmar que un evento online no expone nunca `online_url` en HTML, structured data ni metadatos.
- Confirmar que no aparecen identidades de asistentes en la página pública.
- Con `attendee_visibility=public`, confirmar solo contadores agregados.
- Con `attendee_visibility=responders/private`, confirmar que tampoco aparecen contadores.
- Asociar un evento a una comunidad privada y confirmar que no puede entrar en la superficie pública.
- Poner `discoverable=false` al creador y confirmar que el evento desaparece de directorio y sitemap.
- Revisar `/sitemap-events.xml`.
- Confirmar que `/sitemap-index.xml` referencia el sitemap de eventos.
- Confirmar que `/sitemap.xml` incluye `/eventos`.
- Revisar `robots.txt` y confirmar `/eventos`, `/evento/` y el nuevo sitemap.
- Confirmar enlaces cruzados Portada ↔ Personas ↔ Publicaciones ↔ Comunidades ↔ Eventos.


## 19. Reels y multimedia públicos
- Abrir `/reels` y confirmar que solo aparecen Reels públicos normales de autores descubribles.
- Abrir `/multimedia` y confirmar que solo aparecen fotos/vídeos públicos normales.
- Probar `/multimedia?tipo=image` y `?tipo=video`; ambos deben quedar `noindex,follow`.
- Buscar con `/reels?q=...` y `/multimedia?q=...`; confirmar `noindex,follow`.
- Confirmar que contenido sensible/nudity no aparece en ninguna superficie pública.
- Confirmar que posts VIP, conexiones y círculos no aparecen.
- Confirmar que autores admin no aparecen en Reels/Multimedia públicos.
- Confirmar que autores `discoverable=false` desaparecen de ambos directorios y del sitemap.
- Abrir un Reel en `/reel/:id/:slug` y confirmar canonical y reproducción.
- Probar URL sin slug o con slug antiguo y confirmar redirección 301.
- Confirmar Structured Data `VideoObject`.
- Revisar `/sitemap-reels.xml`.
- Confirmar que `/sitemap-index.xml` referencia el sitemap de Reels.
- Confirmar que `/sitemap.xml` incluye `/reels` y `/multimedia`.
- Revisar `robots.txt` y confirmar `/reels`, `/reel/`, `/multimedia` y el nuevo sitemap.
- Confirmar enlaces cruzados Portada ↔ Personas ↔ Publicaciones ↔ Comunidades ↔ Eventos ↔ Reels.


## 20. Búsqueda pública unificada
- Abrir `/buscar` y confirmar que carga como landing pública.
- Buscar una persona pública y confirmar enlace a `/perfil/:username`.
- Buscar una publicación pública y confirmar enlace a `/p/:id`.
- Buscar un Reel y confirmar enlace a `/reel/:id/:slug`.
- Buscar un hashtag y confirmar enlace a `/hashtag/:tag`.
- Buscar una comunidad pública y confirmar enlace canónico.
- Buscar un evento público y confirmar enlace canónico.
- Confirmar que `/buscar?q=...` devuelve `noindex,follow`.
- Confirmar que perfiles admin y `discoverable=false` no aparecen.
- Confirmar que publicaciones sensibles/nudity o audiencias privadas no aparecen.
- Confirmar que comunidades privadas no aparecen.
- Confirmar que eventos privados, cancelados o ligados a comunidades privadas no aparecen.
- Confirmar que `/sitemap.xml` incluye `/buscar`.
- Revisar `robots.txt` y confirmar `Allow: /buscar`.
