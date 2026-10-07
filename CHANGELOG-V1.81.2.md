# RedLibertad V1.81.2 — Admin Public Events Visibility Hotfix

- Corrige el caso en el que un evento marcado Público creado por un administrador no aparecía en `/eventos`.
- El creador debe seguir activo y con `discoverable=true`.
- No se modifica la política de `/perfiles`: los administradores siguen fuera de ese directorio.
- Sin cambios de base de datos.
- PWA cache renovada.
