# Resuelve V3.5.28 — Biblioteca de soluciones útiles

## Navegación
La biblioteca incorpora accesos rápidos a Todas, Consejos, Orientación, Ayuda y Experiencias, con el número real de soluciones revisadas disponibles en cada categoría. Los números se actualizan para el texto de búsqueda actual, aunque haya seleccionada una categoría diferente, para poder cambiar de tema sin borrar la búsqueda.

No se simula volumen: si una categoría no tiene soluciones aparece «0». Un fallo de API muestra un aviso de consulta y mantiene disponible la búsqueda normal, sin presentar cifras estimadas.

## Seguridad y privacidad
Los recuentos públicos utilizan **exactamente los requisitos editoriales** de la biblioteca: pregunta resuelta, respuesta elegida visible, aprobación humana de esa respuesta, no haber optado por excluirla, contenido mínimo y ambas cuentas activas. Solo se devuelve categoría y cantidad, nunca identidades ni contenido de respuestas pendientes.

El endpoint `GET /api/resuelve/solutions/summary?q=...` valida la misma búsqueda de hasta 80 caracteres que el listado. No activa SEO ni indexación automática.

## Pruebas
Comprobar filtros móvil y ordenador, búsquedas y ausencia de resultados, revocación de biblioteca, eliminación/ocultación de respuesta, cierres de cuenta y recuentos. Validar GitHub Actions y PostgreSQL 18; comprobar Coolify por separado.
