# P0 — puertas pendientes para cierre y promoción

La implementación y sus pruebas locales son revisables. P0 permanece pendiente de cerrar la Definition of Done completa del prompt maestro.

1. **Lector de pantalla por flujo (sección 8.4).** Chromium/axe y teclado tienen evidencia automática. No existe evidencia de una persona escuchando y verificando login, cambio de contraseña y catálogos con lector de pantalla. La inspección de árbol accesible no sustituye esta prueba. Registrar lector/versiones, navegador, recorridos y resultados antes de cerrar esta puerta.
2. **Medición Argon2id en el runtime de destino.** Los parámetros explícitos se verifican localmente. No se desplegó ni se midió el runtime de producción; medir latencia y memoria con concurrencia prevista antes de habilitar cuentas reales.
3. **Promoción de base de producción.** Auditoría solo de metadata: RLS ausente, defaults de propietarios abiertos y sin ledger Drizzle. La migración se probó en bases locales vacía y baseline sintético, no en una réplica del esquema cloud. Reconciliar staging y permisos de cada propietario, respaldo/reversa y LOGIN separados antes de promoción. Ninguna migración se ejecutó en producción.

CI remota y revisión independiente se registran en docs/audit/P0_REPORT.md; no hacer merge hasta su resultado favorable.
Actualización P0.1 (2026-10-14): replay LOCAL exacto del esquema público auditado, ledger/idempotencia/grants/RPC/RLS y reversa parcial de fechas verificados; no acredita staging cloud. PR20/2ee29bff tiene CI verde y revisión de fuente favorable. Staging Free ($0/mes dentro de cuota) sigue pendiente de creación/aprobación humana; la sesión del dashboard está disponible. El laboratorio Argon2 Linux24/1CPU/1GiB aprobado pasó (run38618968477):384 muestras,0errores,RSS344,58MiB; la capacidad del hosting real y latenciaHTTP no quedan certificadas. No se cierra ninguna puerta de lector humano ni se ejecuta SQL en producción.
