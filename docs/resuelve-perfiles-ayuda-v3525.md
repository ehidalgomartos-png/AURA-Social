# Resuelve V3.5.25 — Perfil voluntario de quienes ayudan

## Objetivo
Ofrecer una ficha sencilla y verificable para personas que voluntariamente desean mostrar que han ayudado a otras. No se exhibe ningún perfil de ayuda de forma automática.

## Consentimiento
`resuelve_helper_profiles_v3525.enabled` es `false` por defecto. En Resuelve, cada persona con sesión puede activar/desactivar su ficha con un control independiente de preferencias de avisos o de intereses. La configuración se consulta y modifica solo mediante la sesión de esa persona, con validación booleana, protección de origen y limitación de frecuencia.

## Ficha compartible
Una vez activada, el usuario puede compartir `/resuelve?colaborador=<usuario>`. La API `/api/resuelve/helpers/:username` únicamente devuelve usuarios con consentimiento y cuenta activa. Devuelve solo el nombre de usuario y dos contadores agregados derivados de respuestas visibles a preguntas públicas: peticiones ajenas en las que participó y respuestas elegidas como solución. No muestra email, fecha de nacimiento, contacto, bio, textos de respuesta ni situación comercial. No se representan insignias de profesión «verificada»; los contadores no son una puntuación.

La ficha es `noindex` con la página Resuelve para evitar exposición en Google antes de diseñar controles SEO más maduros. Al desactivarla deja de responder a consultas públicas. No se crean perfiles falsos.

## Validación
Probar acceso público y privado, usuarios desactivados, revocación inmediata y móvil. Se requieren GitHub Actions y PostgreSQL 18 verdes antes de fusionar; despliegue Coolify no se deduce de la fusión.