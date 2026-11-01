# Avance de integración — 2026-10-17

## Corte verificable — 31 octubre 2026

La [auditoría actual de integración y limpieza](../audit/SIII_INTEGRATION_CLEANUP_2026-10-31.md) parte de `main@f19d8a0e` y reconcilia remoto, CI, fuente y deployment `main@7150280f`, incorporando #158 ya fusionado. Documenta la tabla compartida realmente consumida por los portales, el inventario CSS corregido para Windows y el nuevo PR independiente #160. Las secciones inferiores conservan evidencia histórica: no deben interpretarse como estado actual de PRs, contratos o producción.

## Incremento vigente — 26 octubre 2026

La consolidación institucional VNext se documenta en [SIII_INSTITUTIONAL_VNEXT_2026-10-26](SIII_INSTITUTIONAL_VNEXT_2026-10-26.md): portales personales de estudiante/docente, historial publicado, programación de sólo lectura, avisos vigentes, Caja con cargos/abonos idempotentes y captura docente con control de versión. Se apoya en main reconciliado con #115 y conserva sus contratos. Sin DDL nuevo ni cambios de secretos.

El reporte distingue pruebas locales, CI, merge, deployment y aceptación productiva. Asistencia S2S desde Compañero, rectificaciones con doble control, documentos certificados, políticas académicas adicionales y operaciones financieras de conciliación/devolución siguen identificadas como pendientes. Las secciones inferiores conservan el historial de sus respectivas fechas.

## Recuperación y navegación

- PR32 integrado en main: cdc18b28b7144471d91621820f44d9806e983a0b. CI del SHA: SUCCESS (run39072016078). Revisión independiente favorable.
- PR33 reconciliado con32 sin force-push: 19abc17cdb661610ffdd05c63bc886069ebf549b. Ambas comprobaciones Verify SIS verdes (runs39072317213 y39072320898), revisión favorable. Integrado en main mediante c70adc40f16f5269b27f2971029156443b9cd773.
- Cerrados como redundantes PR20–24: sus heads son ancestros comprobados de main. PR9,14,15,16,18,25 cerrados después de comprobar sus cambios por árbol, blobs, migraciones y contratos; evidencia en docs/audit/HISTORICAL_PR_RECONCILIATION_20261017.md.

## Bloque actual: acceso, preparación inicial y expedientes

- Retorno seguro desde MFA a módulos reales y actualización de capacidades entre pestañas; conserva borradores durante la consulta y elimina permisos anteriores al fallar.
- Preparación inicial consulta presencia de los cinco catálogos dentro del ámbito autorizado y abre sus formularios existentes. No acredita configuración completa ni crea datos.
- Expedientes sustituye el corte de200 por cursor estable (created_at con microsegundos +UUID), asociado a tenant/recurso, con límite1–100 y controles de página.
- Operación académica y servicios consumen todas las páginas para sus selectores de personas.
- Sin cambios de esquema ni migraciones.

PR35 integrado:06166d90936fc939334a71ba600ec118c58b2586. Árbol revisado4d87d61:765unitarias,300integraciones PostgreSQL17 y54Chromium aprobadas; typecheck, lint, build y audit0. Ambas verificaciones de PR verdes (39073966596/39073970270) y CI de main39074959864 SUCCESS.

Desplegado en Vercel Production:dpl_3UmcAN39KSSjtpgZqJNCuy6sHw8K, fuente06166d90936fc939334a71ba600ec118c58b2586; alias siii-three.vercel.app confirmado. Comprobación2026-10-17T22:37:38Z:health200,ready200/connected. Esto acredita publicación y salud; el acceso personal a módulos sigue sujeto a completar MFA.

PR36 integrado:dccdb2b78e9bbf32c3aa05a2fa86b39e07f4ba1c. GET sections ahora usa cursores estables y los selectores existentes recorren todos los grupos.8HTTP y1Chromium dirigidos aprobados; ambas Verify SIS del head7ce3b5ea verdes (39075217207/39075232970). CI de main39075950308 SUCCESS. DespliegueProduction dpl_DKR1f2U7gUGxcDRnSntQ54sZQqsX READY con alias confirmado; health200/ready200connected a2026-10-17T22:52:14Z.

Entrega de portal siguiente: nombres y correo de expedientes, comparación bajo bloqueo para impedir pérdida de cambios y auditoría antes/después; no modifica identidad global ni identificadores académicos. Se incorporan los commits del PR37(dfbf5797) con pasos MFA claros, rechazo local de fragmentos de clave y reinicio que vuelve a exigir contraseña. Árbol combinado probado:767unitarias y57Chromium; build correcto, API308completa previa y16HTTP adicionales sobre buildProduction con perfiles y secciones reconciliados. CI del árbol publicado pendiente; no se atribuye aún a producción. Ver REGISTRY_PROFILE_EDITING.md y MFA_ENROLLMENT_GUIDANCE.md.

## Dependencias externas y siguientes módulos

- La metadata de variables Vercel Production no contiene SIII_COMPANERO_INSTITUTION_ID ni SIII_COMPANERO_TOKEN_SHA256. COMPANERO_API_URL y COMPANERO_INTEGRATION_ENABLED no autentican la API de lectura. No se leyeron valores secretos ni se crearon credenciales productivas.
- Sesión personal confirmada en producción; el portal indica autenticador aún pendiente. Activación y custodia de credenciales requieren intervención humana. Se aclaró la diferencia entre clave manual y código TOTP; guía UI mejorada en trabajo separado.
- Ktor:PR196 integrado fae2de1cac8456751203bf4e7508fc856088c465, todas las comprobaciones backend/Android verdes. Adaptador de lectura probado contra Siii/Next real y PostgreSQL local: estudiante, inscripción, sección, docente y sábado10:00–11:00. Pin HTTP/1.1 corrige el h2c/EOF reproducido. No acredita proyección Mongo ni representación Android.
- MongoDB/Render:se reprodujo health500/ready500 cuando vence el ping; PR197 integrado f29587d74b6f89140b4ecd52a4bd79ebc534adb2 corrige budget propio y aplica connect/selection timeouts preservando cancelación externa.20pruebas de salud y553API verdes en laboratorio,30focales tras reconciliar196 y8checks API/Android del head7eeb verdes. Render dep-db9vn3avcj2c739oorcg LIVE en ese SHA; health/ready200 y Mongo up a2026-10-17T22:54:21Z. DNS/SRV síncrono conserva su limitación previa.
- Diagnóstico del mismo health:environment=development, versión0.0.0-dev. El entrypoint estándar selecciona proveedores mock para development; authenticate demo sólo funciona en LOCAL. Cambiar APP_ENV a production sin corregir composición/configuración impediría arrancar. Esta deuda real sigue abierta; la salud200 no acredita configuración productiva completa.
- PR38:fundación outbox0018 en revisión/CI, snapshots reales cifrados y versiones transaccionales; estudiantes conservan su estado fuente explícito para impedir acceso tras baja aunque una inscripción siga enrolled. Sin writers, transporte HTTP ni activación productiva. Migración probada sólo en bases desechables; no aplicada en Supabase Production.
- Receptor de snapshots académicos, persistencia Mongo dedicada y reader autorizado en trabajo separado; emisor/outbox Siii y API/consumo Android siguen pendientes. Un HTTP202 no acredita la aplicación.
- Siguen pendientes: edición completa e historial de expedientes, autorizaciones propias de control escolar por recurso/ámbito, relaciones de planes/materias, rectificaciones con doble control, documentos oficiales y contrato de eventos/proyecciones. No se representan aquí como funciones terminadas.
- Se conservan las puertas históricas no cerradas de lector de pantalla humano, respaldo/restauración cloud y validación de rendimiento del hosting. No se ejecutó SQL productivo.
