# RedLibertad V3.2.14 — Hotfix navegación entre Noticias y Comunidades

Base estable GitHub: V3.2.13, PR #172, commit `6a26b281228a98b3bf5f38a47f699440d1d7d807`.

## Dos errores reproducidos por el usuario
- En Noticias, `Inicio` y `Mi inicio` apuntaban ambos a `/app`, creando botones duplicados.
- `Comunidades` abría siempre `/comunidades`, el directorio público sin botón claro para regresar, incluso teniendo sesión iniciada. Esto aparentaba que no había comunidades y dejaba al usuario fuera del entorno social.

## Corrección
- Cabecera de Noticias: con sesión, **Mi perfil → /app?view=profile**; sin sesión, **Entrar → /app**.
- Barra móvil de Noticias: **Inicio → feed**, **Noticias → sección pública editorial**, **Comunidades → sección interna con sesión / directorio público sin sesión**, **Explorar → explorar dentro de la app con sesión / descubrir público sin sesión**. Ya no se duplica Inicio.
- Menús de escritorio y lateral también envían Comunidades y Explorar a la sección adecuada según sesión.
- `showView('communities')` se incorpora a la lista de deep links legítimos de la app para que `/app?view=communities` abra realmente su contenido y no se quede en el feed.
- Al entrar en Comunidades desde una noticia se conserva `volver=/noticias/p/<id>`; se presenta **«Volver a la noticia»** tanto dentro de la app como en el directorio público.
- El directorio público mantiene ese parámetro al buscar, paginar y abrir una comunidad. Se valida con una **lista estricta de rutas de noticias**, nunca un enlace externo, para evitar redirecciones abiertas.
- Navegación responsive, controles de foco, barra móvil y versiones de assets actualizadas.
- Sin cambios en PostgreSQL, noticias, RSS, SEO, publicaciones reales, permisos, moderación ni ficheros multimedia.

## Validación Coolify
1. CI GitHub verde.
2. Desplegar main, confirmar versión 3.2.14 en `/api/health`.
3. Con sesión iniciada: abrir noticia → Inicio (feed), Noticias (sección), Comunidades (app `?view=communities`, botón de volver a noticia), Explorar (app `?view=explore`), Mi perfil (app `?view=profile`).
4. Sin sesión: noticia → Comunidades (directorio público con botón «Volver a la noticia»). Abrir una comunidad y volver.
5. Comprobar en móvil: cuatro destinos distintos, navegación inferior visible y cabecera no duplicada.
6. Confirmar que búsqueda y paginación conservan el enlace de retorno.
7. Probar que `volver=https://un-sitio-ajeno` no se acepta.
