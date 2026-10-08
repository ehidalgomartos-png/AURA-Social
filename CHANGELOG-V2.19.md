# RedLibertad V2.19.0 — Centro de crecimiento 3.0

Base estable: V2.18.0, commit `70062600789d0d784bd4ff8bb535e5782bb3d6c6` (PR #148 fusionado).

## Implementación
- Nuevo endpoint **GET `/api/admin/growth-center?days=7|30|90`**, protegido con `requireAdmin`, respuestas `Cache-Control: no-store` y resultados en memoria por 60 segundos.
- Cohortes por día de alta (Europe/Madrid) y fuente de atribución: publicación, perfil, comunidad, invitación pública y guías; la categoría **Sin atribución** no se confunde con tráfico directo.
- Activación en los 7 primeros días: primera participación en posts, comentarios, seguimientos, likes o mensajes enviados. No inspecciona contenido de mensajes.
- Actividad D1 en la ventana de 24–48 horas, y D7 en la de 7–8 días. **Denominadores solo de cuentas que ya cumplieron 48 horas y 8 días**, respectivamente; porcentajes no se calculan para cohortes sin muestra.
- Comparativa agregada por origen y detalle de las tres guías públicas predefinidas de V2.18.
- Panel administrativo mobile-first con filtros 7/30/90 días, indicadores, distribución por origen, guías y evolución diaria.
- Reutiliza tabla `signup_attributions`, sin rastreadores externos, cookies publicitarias, datos personales o contenido de chat. La atribución no es retroactiva.

## Corrección de compatibilidad de V2.18
- La tabla histórica `signup_attributions` tenía CHECK de `source_type` sin el valor `guide`, aunque V2.18 ya lo enviaba al registrar desde guías.
- Se utiliza un módulo compartido para registro y estadísticas que **amplía de forma condicional** ese único CHECK para incluir `guide`.
- Esta migración no borra, actualiza ni elimina filas, publicaciones, usuarios o multimedia. No cambia permisos ni visibilidad de contenido.
- La modificación del CHECK se ejecuta dentro de un bloque SQL atómico e idempotente; solo actúa si existe una definición antigua.

## Alcance y límites
- Los indicadores D1/D7 son un **proxy de participación** basado en acciones; no prueban que se haya iniciado una sesión en esas fechas si no hubo acción.
- No hay comparación de visitantes anónimos frente a registros, porque no se ha añadido seguimiento de visitantes.
- Como cualquier métrica de cohorte, las cuentas jóvenes no entran en el denominador de D7; una muestra pequeña requiere cautela.
- Las cifras pueden incluir cuentas posteriormente desactivadas; no se modifican sus datos para calcular estadísticas.
- Monetización aparcada.

## Validación
1. Revisar GitHub Actions y PR, sin fusionar hasta autorización.
2. Tras merge autorizado, verificar Coolify, `/api/health` con `version:2.19.0` y `/api/ready`.
3. Probar registro desde `/guias/como-empezar` con cuenta de prueba y confirmar que no da error CHECK.
4. Abrir Administración → Centro de crecimiento; revisar filtros de 7, 30, 90 días, D1/D7 y desglose por guías.
5. Verificar que una cuenta recién creada **no** se considera perdida en D1/D7 y que el panel no expone usuarios ni mensajes.
6. Comprobar posts, Reels, chat, login, PWA y reglas SEO sin variación.
