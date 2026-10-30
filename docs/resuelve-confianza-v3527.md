# Resuelve V3.5.27 — Revisión de confianza sin sanciones automáticas

## Nueva información para administración
En `/resuelve/admin`, junto a la bandeja de avisos, aparece un resumen agregado de denuncias pendientes por motivo: publicidad encubierta, cualificación posiblemente engañosa, datos personales, consejo potencialmente peligroso y otros.

Las cifras provienen de las denuncias **pendientes** que se refieren a respuestas todavía visibles en preguntas visibles. El recuento se obtiene mediante agrupación SQL; no se infieren intenciones ni se repiten textos privados. Los contadores no sustituyen los reportes detallados.

## Seguridad y revisión humana
La ruta `GET /api/resuelve/admin/trust-summary` exige sesión administradora y solo devuelve agregados numéricos. Una denuncia no demuestra una infracción y no activa bloqueo, sanción o retirada automáticos. Todas las medidas siguen exigiendo la acción explícita del administrador. El resumen puede actualizarse manualmente o tras la revisión de un aviso.

## Comprobación
Confirmar acceso restringido, ausencia de datos de denunciantes, exactitud por motivo y actualización tras desestimar u ocultar una respuesta. Validar la suite completa y PostgreSQL 18 antes de fusionar. El despliegue de Coolify se comprueba por separado.
