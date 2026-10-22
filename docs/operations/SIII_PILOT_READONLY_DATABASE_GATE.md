# SIII → Compañero: puerta read-only de base de datos

Comando (desde checkout de SIII con dependencias instaladas):

```bash
npm run pilot:db:gate
```

Requiere `DATABASE_URL` del **proyecto correcto**, con permisos de lectura sobre `drizzle.__drizzle_migrations`, `drizzle.siii_release_profile` y catálogos `pg_class/pg_roles`. Usar un usuario de **solo lectura**, si está aprovisionado; el script inicia transacción `READ ONLY` y la revierte. No publica la URL, nombres de usuarios, datos académicos ni secretos. No exige `SIII_ALLOW_PRODUCTION_MIGRATIONS` porque jamás escribe.

### Resultados

- Exit `0`, `SCHEMA_READY`: ledger Drizzle validado mediante hashes completos y timestamps, migración 0018 registrada, tablas outbox y versiones presentes con owner esperado, RLS + FORCE, sin privilegios de acceso de columna directos en roles de Data API. **No significa piloto listo**: faltan respaldo, despliegue, instituciones, HMAC y E2E.
- Exit `2`, `NO_GO`: faltan migraciones/tablas o falla un control de metadata. Mantener **ambas flags OFF**.
- Exit `1`: fallo de conexión, permiso, hash o perfil. No intentar migrar ciegamente; revisar por rutas de administración.

El script reutiliza `assertMigrationLedger()` de `db/migration-safety.ts` para evitar una segunda interpretación de hashes y perfiles (canónico o `supabase-v1`). Estas pruebas son metadatos de una puerta, no auditoría exhaustiva de RLS ni protección de roles heredados. El migrador existente conserva su guardia de producción.

Estado observado el 21-oct-2026: Drizzle registra `0000..0017` y no existen tablas 0018 en Supabase. Debe devolver `NO_GO` hasta que exista una migración autorizada y verificada.

**Responsabilidades**
- Codex: preparar reconciliación y ensayo en base restaurada, sin tocar Production.
- Propietario: confirmar respaldo/plan SQL/migración y credencial HMAC de institución destino en Compañero.
- Operación: solo activar en etapas tras certificación de esquema y prueba sintética, sin sacar secretos de los gestores.
