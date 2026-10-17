# Avance de integración — 2026-10-17

## Recuperación y navegación

- PR32 integrado en main: cdc18b28b7144471d91621820f44d9806e983a0b. CI del SHA: SUCCESS (run39072016078). Revisión independiente favorable.
- PR33 reconciliado con32 sin force-push: 19abc17cdb661610ffdd05c63bc886069ebf549b. Ambas comprobaciones Verify SIS verdes (runs39072317213 y39072320898), revisión favorable. Integrado en main mediante c70adc40f16f5269b27f2971029156443b9cd773.
- Cerrados como redundantes PR20–24: sus heads son ancestros comprobados de main. No se cerraron las ramas académicas ni25 sin comprobar equivalencia.

## Bloque actual: acceso, preparación inicial y expedientes

- Retorno seguro desde MFA a módulos reales y actualización de capacidades entre pestañas; conserva borradores durante la consulta y elimina permisos anteriores al fallar.
- Preparación inicial consulta presencia de los cinco catálogos dentro del ámbito autorizado y abre sus formularios existentes. No acredita configuración completa ni crea datos.
- Expedientes sustituye el corte de200 por cursor estable (created_at con microsegundos +UUID), asociado a tenant/recurso, con límite1–100 y controles de página.
- Operación académica y servicios consumen todas las páginas para sus selectores de personas.
- Sin cambios de esquema ni migraciones.

Evidencia local:753unitarias;15pruebas reales de handlers de consolidación;53pruebas Chromium aprobadas (3.2min), incluidas MFA, aislamiento, accesibilidad, carga inicial y paginación real. typecheck, lint y build de producción: salida0. La suite de integración completa está en ejecución; CI y despliegue se registrarán al cerrar sus verificaciones.

## Dependencias externas y siguientes módulos

- La metadata de variables Vercel Production no contiene SIII_COMPANERO_INSTITUTION_ID ni SIII_COMPANERO_TOKEN_SHA256. COMPANERO_API_URL y COMPANERO_INTEGRATION_ENABLED no autentican la API de lectura. No se leyeron valores secretos ni se crearon credenciales productivas.
- Falta probar sesión personal y MFA del responsable en producción; la pestaña de login está abierta para autenticación humana.
- Ktor: adaptador académico real en trabajo separado. La proyección persistente MongoDB/native y Android no se consideran validados por un adaptador de lectura o un HTTP202.
- Siguen pendientes: edición completa e historial de expedientes, autorizaciones propias de control escolar por recurso/ámbito, relaciones de planes/materias, rectificaciones con doble control, documentos oficiales y contrato de eventos/proyecciones. No se representan aquí como funciones terminadas.
- Se conservan las puertas históricas no cerradas de lector de pantalla humano, respaldo/restauración cloud y validación de rendimiento del hosting. No se ejecutó SQL productivo.
