# V3.2.131 — Google Ads y verificación de correo

## Entrega
- ID de Google Ads: AW-18535212811.
- La conversión Registro confirmado NO se dispara en el formulario de alta ni por simple clic.
- Solo el primer POST satisfactorio de /api/auth/verify-email/confirm produce un conversionId UUID, utilizado como transaction_id en gtag.
- El correo verificado es voluntario en esta versión: no se cambian las reglas de acceso de los usuarios existentes.
- El consentimiento publicitario es voluntario y separado del consentimiento histórico de Meta; la medición no se carga antes de aceptarlo.

## Configuración de Coolify (tras autorizar una futura fusión)
- EMAIL_VERIFICATION_ENABLED=true
- RESEND_API_KEY: clave secreta que ya utilice Resend, sin compartirla en GitHub.
- EMAIL_VERIFICATION_FROM: email de remitente verificado en Resend. Si falta, se usa MESSAGE_EMAIL_FROM.
- Si faltan las variables, el registro funciona normalmente, pero no se envían enlaces ni conversiones confirmadas.

## Flujo
1. Registro nuevo exitoso: token aleatorio de un solo uso, hash SHA-256 en PostgreSQL, enlace válido 24 horas.
2. El usuario hace clic en Confirmar correo dentro de /verificar-email/; abrir el enlace sin pulsar no confirma nada.
3. El servidor marca el token consumido de forma atómica; la misma verificación no se puede contabilizar dos veces.
4. La respuesta contiene un UUID no identificativo. Solo con consentimiento de Google Ads se emite conversion.
5. Reenvío disponible solo con sesión iniciada, con límites por cuenta e IP.

## Validaciones previas a una fusión
- GitHub Actions debe ejecutar node --test tests/google-ads-consent-v32131.test.js y el resto de pruebas existentes.
- Probar en staging: enlace válido, caducado, repetido, consentimiento aceptado/rechazado y reenvío limitado.
- Probar Tag Assistant. El bloqueo de anuncios, rechazo y cambios de dispositivo pueden reducir atribuciones.
- Confirmar la etiqueta y el ID de conversión de Google Ads, el remitente de Resend, la fecha de fin y los costes de campaña.
- No fusionar, desplegar o aumentar presupuestos sin autorización explícita.
