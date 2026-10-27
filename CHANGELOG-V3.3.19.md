# V3.3.19 — Descubrimiento real y primeras conexiones claras

Mejora las pantallas existentes sin más tarjetas en Inicio.

- «Se ha unido hace poco» solo para cuentas creadas en los últimos 30 días, confirmado en el servidor.
- Se elimina la pista ambigua «Nuevo por aquí» para perfiles antiguos sin coincidencias; el número de seguidores deja de sustituir a un motivo real.
- Seguir o dejar de seguir sincroniza todos los botones visibles de ese usuario (Inicio, Explorar, primer círculo) una vez confirmada la operación. Impide dobles solicitudes y conserva el estado si falla una actualización secundaria.
- Se mantienen intereses, modos de búsqueda, preferencias, exclusiones de bloqueos, silencios, administradores y ocultaciones, así como el comportamiento mobile-first.
- Sin usuarios inventados, automatismos, nuevas tablas, emails, monetización ni cambios de privacidad.

Pruebas de razones, exclusiones, seguimiento duplicado, éxito y error. CI y PostgreSQL 18 obligatorios antes de fusionar. Verificación de producción independiente.
