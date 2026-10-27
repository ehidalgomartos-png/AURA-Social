# V3.3.25 — PWA: insignias de actividad con sesión segura

Revisión puntual de fiabilidad, sin nuevas pantallas ni más actividad artificial.

- Al cambiar de usuario en la misma sesión del navegador, la consulta pendiente del usuario anterior deja de bloquear la lectura del nuevo usuario. Las respuestas antiguas no pueden actualizar el icono.
- Una respuesta 401/403 de la comprobación autenticada limpia la insignia de la sesión expirada/revocada y no hace peticiones adicionales hasta que se identifique una cuenta nueva.
- Se mantiene la protección de SSE frente a respuestas tardías, la lectura de datos reales y la privacidad entre cuentas.
- Script con versión de caché actualizada para navegadores y PWA; no se añaden temporizadores, rastreo ni permisos.
- Pruebas automatizadas de sesiones, carreras entre cuentas, revocación y regresión; mantiene compatibilidad móvil y escritorio.
- No afecta al diseño, a Stripe, a los correos, a noticias ni al algoritmo de recomendación.
