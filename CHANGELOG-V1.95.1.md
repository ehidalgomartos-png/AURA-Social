# RedLibertad V1.95.1 — Public Profile Layer Hotfix

Hotfix visual sobre V1.95.0 estable.

## Problema
Al abrir un perfil público desde una publicación, la portada podía quedar por encima de la foto de perfil y taparla parcialmente en móvil y escritorio.

## Solución
- public-profile-card crea su propio contexto de apilado;
- portada en z-index 1;
- cuerpo del perfil en z-index 2;
- avatar en z-index 4;
- sombra/borde del avatar reforzados para mantener separación visual.

Sin migraciones, sin monetización y sin cambios en src/routes/posts.js.
