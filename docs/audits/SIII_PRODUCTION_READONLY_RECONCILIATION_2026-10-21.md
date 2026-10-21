# SIII: reconciliación productiva de solo lectura (21-oct-2026)

**Propósito:** evidencia concreta para preparar una actualización segura del único Supabase productivo `Siii` y desbloquear el piloto SIII → Compañero. **Ningún paso aquí autoriza escrituras o migraciones.**

## Evidencia recopilada de Supabase (solo SELECT)

- Proyecto `Siii`: 41 tablas de `public`, **41 con RLS y 41 con FORCE RLS**.
- Existen los roles `siii_app`, `siii_migrator` y el usuario restringido de runtime.
- El ledger **`drizzle.__drizzle_migrations` contiene 18 registros**, con identificadores 1–18. Sus marcas temporales corresponden a entradas `idx:0..17` del `db/migrations/meta/_journal.json` de Git. Esta coincidencia NO confirma todavía los hashes completos ni todo el esquema.
- El historial separado de migraciones de Supabase expone tres entradas iniciales. **No usar ese número para concluir que faltan todas las migraciones posteriores**.
- La consulta `to_regclass` confirma que **NO** existen `academic_section_versions` ni `academic_section_outbox` (0018).
- Tampoco existen las tablas sondeadas de 0019 (admisiones), 0020 (vínculos de cuentas) ni 0021 (finanzas).
- Git contiene `0018..0023` y código de API que espera ese esquema. **Promocionar el código actual a producción antes de preparar la base puede causar errores 500 en rutas nuevas.**

## Consulta reproducible

Ejecutar exclusivamente `scripts/siii-production-readonly-preflight.sql` en SQL Editor sobre el proyecto y base correctos. No pegar aquí ningún resultado que incluya datos personales o secretos; las consultas solo devuelven metadatos.

## Orden de desbloqueo

1. **NO-GO** para habilitar `SIII_ACADEMIC_OUTBOX_ENABLED` o `SIII_COMPANION_DELIVERY_ENABLED` mientras 0018 esté ausente. Las flags se mantienen OFF.
2. Revisar `drizzle.__drizzle_migrations` contra `_journal.json`: orden/fecha, hashes **completos** y compatibilidad de SQL/objetos (no reemplazar hashes históricos a la fuerza).
3. Confirmar backup restaurable y autorización explícita para promoción del mismo proyecto productivo. Reproducir las migraciones pendientes sobre un clon desechable/restaurado y analizar dependencias, owners, RLS, FKs, políticas y grants.
4. Aplicar únicamente una secuencia revisada (0018 y posteriores necesarios) por el migrador autorizado; verificar que no se cambien indebidamente cuentas ni módulos activos.
5. Publicar a Vercel el SHA con CI verde y comprobar el alias de producción; el despliegue observado anteriormente seguía en `ffaa475`, anterior al emisor.
6. Confirmar en Compañero una institución piloto existente/habilitada en `platform_institutions` de `companero_dev`. Su `_id` es el **tenant receptor**, no necesariamente el UUID SIII.
7. Aprovisionar HMAC con el bootstrap ya existente en Compañero: `SIII_INBOUND_BOOTSTRAP_ENABLED=true` y las variables temporales; validar resultado, volver a `false` y retirar secretos temporales. No insertar manualmente `secretCiphertext` en Mongo.
8. Ejecutar evento sintético: commit SIII → outbox → entrega HMAC → Ktor 202/duplicado 200 → Mongo aplicado. Verificar rechazos 401 por firma/nonce vencido, retries y caída temporal.
9. Extender la lectura de la proyección institucional a API autenticada y Android, con vínculo de identidad, tenant y revocación real. No reportar `E2E_VERIFIED` antes de ese paso.

## Responsabilidades

- **Codex:** revisar pruebas, generar plan SQL compatible, ensayar localmente/aislado, preparar PR y evidencia, sin conectarse a secretos de producción.
- **Propietario:** aprobar cambios productivos, preservar claves, confirmar tenant institucional, respaldos y cutover.
- **Prohibido:** `npm run db:migrate` a ciegas sobre producción, editar ledger/hashes para forzar éxito, habilitar flags antes de contar con outbox, copiar secretos a issues/logs.

Relacionados: [SIII issue #69](https://github.com/ErickRFM/Siii/issues/69), [Compañero issue #207](https://github.com/ErickRFM/Compa-ero-de-esc/issues/207), PR #70 (preflight sin red), PR #208 (bootstrap Mongo) y PR de control de tenant actualmente en revisión.
