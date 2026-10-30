# Resuelve V3.5.17.1 — Enviar una pregunta concreta a alguien conocido

## Finalidad
Facilitar que una persona envíe una **petición pública concreta** a alguien que conoce y que podría ayudar, sin tener que invitarle a navegar por todas las peticiones.

## Dónde aparece
- En cada tarjeta de petición de la lista: botón «Enviar esta pregunta».
- En el detalle, después de las respuestas: el mismo botón con opciones de envío.

## Canales
- WhatsApp, Telegram, correo electrónico y SMS mediante enlaces que abren las aplicaciones del usuario.
- «Compartir desde mi móvil» cuando el dispositivo soporte el menú nativo.
- «Copiar enlace» como alternativa, incluido un cuadro para copiar manualmente si falla el portapapeles.

La opción empieza **cerrada**; la persona debe pulsar para abrirla y después elegir el canal y el destinatario. No se envía nada por el servidor, no se accede a la agenda y no hay mensajes automáticos.

## Qué se comparte
- Una invitación breve para ayudar.
- El título público de la pregunta.
- Un enlace directo a `/resuelve?id=<id>`.

No se incluye el cuerpo de la pregunta, las respuestas, el correo del autor ni otros datos de terceros en el mensaje saliente. Se utilizan valores escapados para las URL y nodos de texto, sin inyección HTML. El destinatario puede **leer** sin cuenta; para **responder** puede registrarse dentro de Resuelve con la cuenta única de RedLibertad.

## Alcance
- Sin cambios de base de datos, autenticación o permisos.
- No se abren perfiles ni se presume verificación profesional.
- Sin compra o contratación obligatoria; los enlaces comerciales siguen siendo complementarios.
- Se mantienen la moderación actual y la política de indexación.
