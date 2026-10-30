# RedLibertad Resuelve — Personas que pueden ayudar (V3.5.16)

## Propósito
Conectar peticiones reales con usuarios que desean ofrecer tiempo, conocimientos o experiencias, sin convertir la sección en un escaparate de productos o servicios.

## Funcionamiento
- Cada persona con cuenta RedLibertad puede entrar en la pestaña **Puedo ayudar**.
- La primera vez, elige voluntariamente entre cuatro temas existentes: consejos, orientación, ayuda y experiencias.
- Esa selección se guarda **privadamente** en una tabla por usuario; solo el propio usuario la consulta o modifica.
- Se muestran únicamente peticiones abiertas de otros usuarios activos de los temas elegidos, por orden reciente, con paginación.
- El usuario decide abrir una petición y escribir una respuesta. No existe asignación, mensajería, perfil de experto, insignia ni contacto automático.
- Se pueden cambiar los temas o vaciar la selección en cualquier momento. Los visitantes siguen pudiendo leer las peticiones generales.

## Seguridad
- API de preferencias y listado filtrado requieren sesión activa.
- Cambios de preferencias protegidos con comprobación de origen y límite de frecuencia.
- Lista blanca de cuatro temas, sin duplicados ni valores arbitrarios; consulta PostgreSQL parametrizada.
- Nunca se incluyen peticiones propias, ocultas ni resueltas en «Puedo ayudar».
- Las preferencias no se publican ni se usan para enviar correos, mensajes o notificaciones.

## Pruebas
El test HTTP de Resuelve comprueba acceso anónimo denegado, rechazo de cambios de otro origen, preferencias por usuario, filtros y cursores, exclusión de peticiones propias y desactivación de temas.

## Siguiente posible etapa
Agradecimientos voluntarios y seguimiento de resultados reales, sin rankings de popularidad comprados ni recompensas por promocionar productos.
