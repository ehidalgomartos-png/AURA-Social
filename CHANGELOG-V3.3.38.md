# V3.3.38 — PWA: recuperación tras arrancar sin conexión

- Si el registro del service worker falla cuando la aplicación se inicia sin Internet, un evento real de reconexión permite registrarlo sin recargar la página.
- Reutiliza el límite existente de comprobación de versiones (una hora) y limita reintentos fallidos con Internet a un mínimo de cinco minutos. Las peticiones concurrentes se agrupan y no se programan temporizadores.
- Se ignoran reintentos sin conexión o mientras la aplicación permanece oculta.
- El proceso de instalación Android/iOS, el registro de notificaciones, las insignias y las reglas que excluyen APIs y archivos privados de la caché no cambian.
- Incluye pruebas de recuperación offline, errores repetidos, app oculta, frecuencia de consultas y compatibilidad.
