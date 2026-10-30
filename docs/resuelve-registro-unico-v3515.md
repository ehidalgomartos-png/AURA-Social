# V3.5.15 — Una sola cuenta: alta y acceso desde Resuelve

## Objetivo
Al entrar en `/resuelve`, una persona puede leer preguntas sin cuenta o registrarse **en esa misma página**. El registro crea un usuario normal en la base de datos de RedLibertad, no un perfil aislado. Sirve para Resuelve, la red social y los demás servicios de la misma web.

## Flujo
1. Visitante toca «Crear cuenta y pedir ayuda» o «Ya tengo cuenta».
2. Se abre el formulario dentro de Resuelve, sin redirigir a la portada.
3. Alta: nombre visible, usuario, correo, contraseña (mínimo 10), fecha de nacimiento, aceptación de términos y normas, lectura de privacidad.
4. Se reutiliza `POST /api/auth/register`, con sus mismas restricciones de 18 años, comprobaciones, límites de frecuencia, hash de contraseñas, recepción legal, correo de verificación y cookie de sesión HttpOnly.
5. Se consulta `GET /api/auth/me` para confirmar la sesión. Solo cuando responde correctamente se habilita publicar y responder.
6. El usuario permanece en Resuelve, incluso en la petición que estaba consultando. La sesión también sirve en `/app`.
7. «Ya tengo cuenta» reutiliza `POST /api/auth/login` y la recuperación de contraseña ya existente.

## Principios de seguridad y continuidad
- No hay nueva tabla de usuarios, token de acceso ni API de registro paralelo.
- Las contraseñas se envían solo al endpoint habitual por petición HTTPS/same-origin, nunca se guardan en localStorage, sessionStorage ni cookies desde JavaScript.
- La aceptación legal es opt-in: checkbox sin marcar y obligatorio; el servidor valida `acceptTerms: true`.
- La edad se comprueba en servidor; el límite de fecha visible es una ayuda adicional.
- El remitente de verificación no se inventa: se utiliza el mecanismo ya configurado, mostrando si el correo se pudo enviar.
- No se publica ninguna petición automáticamente por registrarse. La lectura permanece pública.
- La atribución de captación usa `resuelve` validado estrictamente, sin URLs arbitrarias.

## Comprobación funcional recomendada en producción
1. Entrar a `/resuelve` desde una ventana privada y registrarse allí.
2. Confirmar que la página no redirige a Inicio y permite publicar.
3. Comprobar la cuenta también en `/app` con la sesión compartida.
4. Verificar el correo recibido, la ruta de recuperación y que no se han generado cuentas duplicadas.
