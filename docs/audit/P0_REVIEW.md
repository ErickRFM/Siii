# P0 — revisión independiente y resolución

Revisor independiente, solo lectura, sobre c7334cdf..9d72c00a. No ejecutó servidores ni SQL, ni leyó secretos. Emitió cuatro hallazgos importantes y dos menores; ningún crítico demostrado. El código posterior se verifica por las regresiones del ejecutor; no se presenta como una segunda aprobación independiente.

| Hallazgo | Cambio y evidencia |
|---|---|
| Autorización académica obsoleta tras revocar sesión | POST/PATCH llaman lockWriteAccess dentro de la transacción antes de bloquear recursos. Regresiones HTTP con bloqueo real de role_assignments: 201/200 antes de la corrección → 403 después; sin cambios ni auditoría de éxito. El runtime local de Next bufferiza el body antes del handler, por eso se reproduce la ventana con un bloqueo real, no con un body simulado. |
| Plan reactivado bajo programa archivado | PATCH de curricula bloquea padre antes que hijo y exige programa activo para activar. Caso secuencial: 200 incorrecto → 409; prueba adicional compite archivo/activación con dos actores y comprueba que no existe estado inválido. |
| Defaults globales sobreviven REVOKE de public | Se consideran creadores con defaclnamespace=0 y se revocan grants prohibidos en nivel global y public para tablas/secuencias. Regresiones: acceso a tabla futura y a objetos de otro creador era true → false. |
| Error de mutación elimina borrador | Errores de carga/mutación separados; tabla y editor permanecen montados, feedback asociado al campo y foco. Prueba de corregir y reintentar sin reload, y rechazo de archivo sin ocultar datos. |
| Actualizar no reintenta programas | Actualizar activa nueva carga del selector de programas; prueba de un 503 transitorio seguido de recuperación y formulario habilitado. |
| CHECK lockout_level no reflejado en schema | Se añade platform_users_lockout_level_check al schema Drizzle con el mismo nombre/condición SQL. |

También se asegura pool.end() si falla la adquisición inicial de conexión del migrador. No se cambian roles/políticas de P1.

## Comportamientos que el revisor no certificó y decisión del ejecutor

- **CI remota:** los dos runs iniciales (push y PR) de 9d72c00a pasaron; el commit de correcciones necesita su propio CI verde.
- **CSP/hidratación de producción:** verificación local separada pasó: 11 scripts con nonce coincidente, nonce distinto por petición, HSTS, sin unsafe-eval ni violaciones CSP, botón hidratado funcional.
- **Resultados locales:** comprobados por comandos del ejecutor en el informe de fase; no se atribuyen al revisor.
- **Lector de pantalla:** pendiente de evidencia humana por flujo. Coste si se omite: posibles barreras que axe/teclado no detectan.
- **Argon2 en hosting:** solo medición local; gate de runtime de destino. Coste si se extrapola: latencia/memoria podrían superar el presupuesto real.
- **IP de proxy:** se acepta únicamente el header sobrescrito de Vercel; otro hosting usa bucket desconocido global. Coste: integración confiable necesaria para separar clientes.
- **Roles cloud y migración staging:** no se certifican desde fixtures locales; verificar propietarios, defaults y LOGIN separados en staging antes de promoción. Coste: el operador cloud puede carecer de permisos para revocar defaults.
- **Funciones/RPC futuras:** producción auditada no tiene funciones públicas. Esta migración endurece tablas/secuencias; no revoca EXECUTE de funciones. Cualquier futuro SECURITY DEFINER/RPC debe revisar y revocar defaults/grants explícitamente antes de crearlo. Coste si se confunde con cobertura de RLS: un RPC privilegiado podría eludir privacidad.
- **Drift de roles existentes:** sin exploit actual verificado. Se conserva gate de provisión/privilegios en staging; no se presupone que los roles con esos nombres ya sean seguros.

No se difiere ninguno de los cuatro importantes ni los dos menores del revisor. Las puertas ambientales siguen explícitas en docs/BLOCKERS.md.

Verificación adicional del ejecutor: todos los clientes de fixtures y configuración Vitest usan el mismo selector de INTEGRATION_DATABASE_URL local. Se rechazan bases sin prefijo p0_ o sufijo _test incluso si el entorno dice test. Caso de nombre ordinario local RED → GREEN; una URL remota de runtime nunca se elige cuando existe la URL aislada. Reduce riesgo de escribir fixtures en una base accidental al ejecutar los tests.
