# P0 — puertas pendientes para cierre y promoción

La implementación y sus pruebas locales son revisables. P0 permanece pendiente de cerrar la Definition of Done completa del prompt maestro.

1. **Lector de pantalla por flujo (sección 8.4).** Chromium/axe y teclado tienen evidencia automática. No existe evidencia de una persona escuchando y verificando login, cambio de contraseña y catálogos con lector de pantalla. La inspección de árbol accesible no sustituye esta prueba. Registrar lector/versiones, navegador, recorridos y resultados antes de cerrar esta puerta.
2. **Medición Argon2id en el runtime de destino.** Los parámetros explícitos se verifican localmente. No se desplegó ni se midió el runtime de producción; medir latencia y memoria con concurrencia prevista antes de habilitar cuentas reales.
3. **Promoción de base de producción.** Auditoría solo de metadata: RLS ausente, defaults de propietarios abiertos y sin ledger Drizzle. El ensayo cloud aislado ya reprodujo el esquema auditado y adoptó el baseline0–1; el migrador canónico falló y el hardening permanece bloqueado por la autoridad requerida en SQL histórico0003. Reconciliar ese prerrequisito soportado y completar RLS/grants/RPC, respaldo/reversa y pruebas de runtime antes de promoción. Ninguna migración se ejecutó en producción.

CI remota y revisión independiente se registran en docs/audit/P0_REPORT.md; no hacer merge hasta su resultado favorable.
Actualización P0.1 (2026-10-14): replay LOCAL exacto del esquema público auditado, ledger/idempotencia/grants/RPC/RLS y reversa parcial de fechas verificados; no acredita staging cloud. PR20/2ee29bff tiene CI verde y revisión de fuente favorable. Staging Free ($0/mes dentro de cuota) ya está creado; el resultado real del ensayo autorizado del 2026-10-15 figura abajo. El laboratorio Argon2 Linux24/1CPU/1GiB aprobado pasó (run38618968477):384 muestras,0errores,RSS344,58MiB; la capacidad del hosting real y latenciaHTTP no quedan certificadas. No se cierra ninguna puerta de lector humano ni se ejecuta SQL en producción.

## Actualización staging real — 2026-10-15

P0 permanece abierta. Staging Free siii-staging-p01 (vsnrbjexusidlvhkhmqg), PostgreSQL17.11, ya contiene las dos bases aisladas autorizadas y siete roles mínimos. El LOGIN hereda únicamente siii_app (NOLOGIN). Se conservaron todos los recursos.

- **PASSED:** preparación; replay legacy corregido/revisado en su único reintento; firma exacta contra ambas referencias; rechazo BASELINE_REQUIRED antes del ledger; adopción baseline con hashes0–1; fixtures sintéticos; una repetición independiente del CLI original que devolvió BASELINE_ALREADY_RECORDED sin cambios de ledger/firma/filas/rutinas.
- **FAILED — migración canónica:** base vacía confirmó SQLSTATE42501/alter_role en0003 por requisito de superusuario. Legacy, después de adoptar baseline, falló CLOUD_CLI_FAILED sin SQLSTATE capturado. No se reintentaron los migradores; no se editaron/saltaron SQL ni ledgers. Resolver un mecanismo administrativo soportado para ejecutar SQL histórico sin modificarlo antes de repetir.
- **Estado conservado:** empty sólo contiene inicialización Drizzle vacía y cuatro defaults sintéticos. Legacy conserva12tablas baseline RLSfalse, ledger0–1,1institución/2períodos sintéticos, RPC SECURITY DEFINER deliberadamente abierto y12defaults amplios para probar hardening. No representan un esquema endurecido.
- **NOT_RUN:** idempotencia canónica0–5, CRUD/auditoría runtime, RLS endurecida frente a grants permisivos, permisos/RPC/defaults futuros endurecidos y reversa. No cerrar estas puertas con resultados locales.
- **PASSED — control seleccionado:** SHA256 antes/después efcfb5ef4928cc8f79b8a81469cfbdee797f488079dcfce0e65a9a1b314ea28a. Sin escrituras de producción ni cambios en auth/storage u otros esquemas administrados. Hash de metadata seleccionada, sin acreditar respaldo o datos internos completos.

QA local final del coordinador: npmci/typecheck/lint,121unitarias,94integración,10Chromium,build,audit0,diff-check; solicitud temporal contra suspensión liberada. Fuente353472… revisada favorable; commit ee6c39ec y CI remota de PR20 verdes (runs38797574280 y38797579552). Evidencia: [reporte staging](audit/P0_1_STAGING_RESULT.md) y [JSON](audit/P0_1_STAGING_RESULT.json). Permanecen lector humano, hosting/HTTP y promoción controlada. El laboratorio Linux Argon2 aprobado conserva su evidencia criptográfica; no se volvió a ejecutar.

LOGIN real sólo lectura comprobado en ambas bases: identidad restringida correcta, sin DDL/privilegios elevados. El guard original acepta empty y rechaza legacy con DATABASE_ROLE_UNSAFE por unsafe_rpc=true, debido al fixture SECURITY DEFINER deliberadamente sin endurecer. No se ejecutó RPC ni se escribieron datos; CRUD/auditoría y seguridad end-to-end siguen pendientes.

## Consolidación 2026-10-15

Rama aislada codex/sii-consolidation-20261015 reúne ambas cadenas sin modificar el merge abierto en el checkout original. Historial SQL0000–0010 restaurado/preservado exactamente. Pruebas e informe: docs/audit/SII_CONSOLIDATION_REPORT.md.

- La revisión automática rechazó modificar la migración histórica0003 por riesgo de drift con ledgers existentes. La restricción PostgreSQL42501 de NOSUPERUSER redundante se reprodujo localmente; propuesta NO aplicada en docs/operations/proposals/P0_MANAGED_ROLE_NORMALIZATION.md. Se requiere aprobación explícita de una estrategia compatible de release/baseline, no reescritura de hashes ni omisión de controles. El ensayo cloud anterior se preserva.
- Vercel ya permite consultar el proyecto tras reconexión; Preview no tiene DATABASE_URL. No se reutiliza el secreto production. Falta una base staging migrada/endurecida, credencial DML mínima, claves MFA separadas, pruebas de rol y login remoto. Un Preview que compile no acredita operación funcional.
- Lectura humana con lector de pantalla, hosting/HTTP real, backup/restauración/reversa cloud y E2E Ktor continúan abiertos; la copia/restauración PostgreSQL local no los sustituye.
- Main y producción permanecen sin cambios. PR consolidación debe mantenerse draft mientras falten estas puertas, aunque CI sea verde.
