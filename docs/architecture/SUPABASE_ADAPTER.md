# Siii ↔ Supabase PostgreSQL (sin duplicar identidad)

## Fuente de verdad
Siii usa **PostgreSQL administrado por Supabase** exclusivamente como base de datos en esta etapa. La captura del panel confirma que el proyecto existe, pero no prueba que las migraciones estén aplicadas. El panel mostraba "No migrations". No asumir tablas existentes.

## Credenciales
- `DATABASE_URL`: URL de conexión PostgreSQL desde **Supabase → Connect**, preferentemente Session Pooler para servidores persistentes compatibles. No equivale a `https://<project>.supabase.co`.
- `MIGRATION_DATABASE_URL`: conexión directa o Session Pooler apropiada para ejecutar DDL desde un ambiente seguro. Usar una cuenta con privilegios mínimos apropiados.
- `NEXT_PUBLIC_SUPABASE_URL` no es necesario mientras la autenticación siga siendo propia del SIS.
- Nunca guardar credenciales, access tokens ni `service_role` en Git o en el navegador.
- Revisar SSL del proveedor y reglas de conexión. En despliegues donde se necesite IPv4, usar el pooler recomendado por Supabase.

## Decisión de identidad
Se mantiene la identidad propia de Siii mediante `platform_users`, sesiones opacas y roles multiinstitución. Supabase Auth **no se habilita implícitamente**: mezclarlo con autenticación propia crearía dos autoridades y flujos contradictorios. Si se adopta más adelante, requiere ADR y migración de identidad.

## Migraciones
1. Crear un proyecto Supabase de **staging/desarrollo** separado del proyecto principal para ensayar.
2. Obtener una cadena de conexión de staging mediante Secret Manager.
3. `npm ci`; ejecutar `npm run db:migrate` usando `DATABASE_URL` de staging.
4. Confirmar tablas y `__drizzle_migrations` mediante SQL read-only; ejecutar la migración por segunda vez para demostrar idempotencia del migrador.
5. Ejecutar pruebas de integración con PostgreSQL real y probar aislamiento de dos instituciones.
6. Obtener respaldo y ventana de cambio antes de aplicar en producción.
7. En producción no ejecutar `db:push` ni pegar SQL sin revisión y respaldo.

## Alcance presente
La migración inicial contiene foundation + identidad. Los módulos de expedientes, materias, grupos, horario, calificaciones y la integración Ktor son fases adicionales y NO aparecen como completados por crear pantallas de navegación.
