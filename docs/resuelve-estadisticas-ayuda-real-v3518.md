# Resuelve V3.5.18 — Estadísticas de ayuda real

## Objetivo
Dar a administración una visión veraz del impacto de Resuelve, sin convertir la ayuda en una competición ni generar datos ficticios.

## Panel privado
En la propia página de Resuelve, solo con sesión de administración, aparecen ocho contadores:
- **Peticiones públicas:** peticiones abiertas o resueltas de autores activos, nunca ocultas.
- **Pendientes de resolver:** peticiones públicas todavía abiertas.
- **Peticiones con respuestas:** peticiones públicas con al menos una respuesta visible de un usuario activo.
- **Problemas resueltos:** peticiones marcadas resueltas por su autor, cuya respuesta aceptada sigue visible.
- **Personas que han respondido:** autores distintos de respuestas visibles a peticiones públicas.
- **Soluciones agradecidas:** peticiones resueltas con respuesta aceptada visible y agradecimiento voluntario del autor.
- **Peticiones en 30 días:** nuevas peticiones públicas creadas en los últimos 30 días.
- **Resueltas en 30 días:** peticiones públicas cuya resolución vigente con respuesta visible ocurrió en los últimos 30 días.

## Definiciones y límites
La respuesta a una pregunta no implica que el problema esté resuelto. No se cuentan solicitudes ocultas, respuestas ocultas, usuarios inactivos, perfiles virtuales ni supuestos casos de éxito. Los agradecimientos voluntarios son distintos de las soluciones, y una ausencia de agradecimiento no significa insatisfacción.

La consulta se ejecuta en PostgreSQL mediante agregaciones, sin retornar nombres, correos, teléfonos, contenido de preguntas ni identificadores de usuarios. La ruta `GET /api/resuelve/admin/impact` exige sesión y permisos de administrador; la respuesta lleva `Cache-Control: no-store`.

El panel es exclusivamente administrativo, se adapta al móvil y permite actualizar cifras a voluntad. No introduce seguimiento comercial, nuevos correos, notificaciones, rankings, tablas ni SEO público.

## Verificación
Las pruebas comprueban acceso denegado a visitantes y usuarios normales, estado inicial en cero, exclusión de preguntas ocultas y respuestas no visibles, cálculo de personas distintas que han respondido, agregación de periodos y ausencia de datos personales.
