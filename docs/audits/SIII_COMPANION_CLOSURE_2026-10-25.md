# Cierre coordinado V19 — 25 octubre 2026

El preflight productivo sigue en **NO-GO**. No se aplicaron migraciones, no se modificaron credenciales ni se habilitó entrega institucional.

## Evidencia de lectura y entrega sintética

Compañero #225 quedó fusionado en `a3db6cb5e961820a6dedd3a9f1da29bab879c1e0` con API, empaquetado y Academic/Management API31/35 verdes. No se retiraron aserciones MFA.

Compañero #226 quedó fusionado en `186b9af2a976e33fa06209f7e5915c2de77ba72a`. El candidato `c0d5d8be3bf8b371c37b821e9620ed655f7cd50a` pasó API CI40213920749, Android CI40213920707 y el contrato cruzado SIII40213939430. Ese contrato ejecutó HTTP real sintético de SIII, outbox PostgreSQL, envío firmado, Ktor, proyección MongoDB y GET académico autenticado. Comprobó materias/docentes/grupos/horarios y revocación antes de entregar el nuevo evento. Todos los controles de Verify SIS terminaron verdes.

Android #227 quedó fusionado en `ebaadd7c4736a2a6c725031037742705c89df32d`; su candidato a704d2ab pasó API y Android40216212120 con las cuatro variantes y empaquetado. El puente de asistencia conserva PR separado #228. El receptor fijado por este PR debe pasar su contrato completo antes de integrarse. La prueba ampliada persiste asistencia, presencia y outbox en MongoDB; usa exclusivamente un gateway push falso y conserva REVIEW_REQUIRED. Esa aceptación sintética no prueba recepción FCM ni presencia física.

El contrato ampliado fuente 97022cc9 → receptor 220ee93c pasó en Verify SIS40219974891: los tres jobs verdes y27 casos de contrato/receptor sin fallos, errores ni omisiones. Verificó horario oficial, catálogo, inscripción, revocación, apertura del pase, cola push con gateway falso, confirmación HTTP y roster docente persistido. #229 corrigió sincronización IME conservando aserciones y quedó fusionado en e9a7f632; ambas matrices Android API31/35 de Academic y Management pasaron en el candidato16d565e3, con dos ejecuciones MFA adicionales por job Management35. #228 incorpora main en el nuevo receptor f9aaf903; este pin exige validar nuevamente el SHA exacto antes de integrar.

## Metadatos productivos revalidados

La consulta de solo lectura del25octubre al proyecto Supabase `kkjzbqsaummyralqjqrb` observó18 migraciones aplicadas, ausencia de `academic_outbox` y `academic_section_versions`, y cero tablas públicas sin FORCE RLS. No consultó filas académicas. El ledger sigue hasta0017; pendientes0018..0025 deben aplicarse por el procedimiento administrado, en orden y tras respaldo/restauración verificables. No se ejecutó DDL productivo.

El ensayo previo de migración/rollback/respaldo/restauración local documentado en `SIII_COMPANION_DATABASE_READINESS_2026-10-24.md` usa datos sintéticos y no sustituye un respaldo productivo reciente. Aún falta evidencia de respaldo retenido y recuperable; no se afirma que exista ni que falte en el proveedor.

## Receptor QA y bloqueos

El usuario confirmó el workspace Render `esc`. Solo hay un servicio Compañero ligado a main, sin previews; Render confirmó el despliegue automático de186b9af2. GET /health informó entorno development y MongoDB up. No se cambió su configuración.

La captura proporcionada por el usuario acredita que FIREBASE_SERVICE_ACCOUNT_JSON_B64 está definida, con valor enmascarado. No acredita su project_id, validez ni envío. El Dashboard etiqueta el servicio Production y /health informa development; falta confirmar aislamiento QA antes del piloto. El conector no ofrece lectura de variables, no hay sesión Render CLI y el navegador local está deshabilitado. No se verificaron flags productivos ni la credencial académica habilitada del receptor; no se imprimieron ni modificaron secretos. La configuración pública Android corresponde a sistema-ii y al paquete org.companerodeescuela.

No hay teléfonos físicos conectados: solo un emulador. Permanecen pendientes el registro de token QA real, aceptación y recepción FCM en los tres estados de la aplicación, acceso directo, QR institucional/red escolar, confirmación y revisión docente con dispositivos reales. La activación productiva requiere además cerrar migraciones, respaldo, credenciales, outbox y piloto controlado.
