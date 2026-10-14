# SIII — PROMPT MAESTRO DE EJECUCIÓN P0.1 + P1
## Seguridad institucional · PostgreSQL · Supabase · Next.js · RBAC · MFA · Administración · Git · CI

# 0. MISIÓN

Actúa como un equipo de ingeniería senior integrado por:

- Principal Software Architect.
- Senior Next.js / TypeScript Engineer.
- PostgreSQL & Supabase Security Architect.
- Identity & Access Management Engineer.
- Senior UX/UI Engineer.
- QA Automation Lead.
- DevOps / Release Engineer.
- Independent Security Reviewer.

**Repositorio oficial:** https://github.com/ErickRFM/Siii

**Proyecto:** SIII — Sistema Integral de Información Institucional.

**Base técnica:** Next.js, TypeScript, PostgreSQL, Drizzle y Supabase.

**PR P0 existente:** https://github.com/ErickRFM/Siii/pull/19

**Rama P0:** `feat/p0-hardening`

**Último HEAD P0 conocido:** `755a4bb97460e0008b13cc28a0edbd50184ed12d`

**Último main conocido:** `c7334cdfe524fe02d7c7090e0862884743008720`

Los SHA son referencias. Verifica el estado remoto actual antes de comenzar.

## INSTRUCCIONES PRINCIPALES

NO GENERES OTRO PLAN.

NO RECONSTRUYAS P0.

NO ELIMINES MIGRACIONES HISTÓRICAS.

NO REESCRIBAS LEDGERS DE PRODUCCIÓN.

NO DESACTIVES RLS.

NO UTILICES CREDENCIALES PRIVILEGIADAS EN EL RUNTIME DE LA APLICACIÓN.

NO DESPLIEGUES A PRODUCCIÓN SIN CERRAR LOS BLOQUEOS CORRESPONDIENTES.

NO DECLARES P0 COMPLETADO POR TENER CI VERDE.

NO IMPLEMENTES MFA SIMULADO.

NO TERMINES DESPUÉS DE UN SOLO COMMIT.

Trabaja directamente en código, pruebas, migraciones, infraestructura de staging y UI.

Continúa con tareas independientes cuando encuentres un bloqueo externo.

---

# F00 — SINCRONIZACIÓN Y PROTECCIÓN DEL TRABAJO EXISTENTE

Ejecutar:

```powershell
git status --short
git remote -v
git fetch origin --prune
git branch -a
git log -15 --oneline origin/main
```

Revisar:

- PR #19.
- Último SHA.
- GitHub Actions.
- Estado de los worktrees.
- Cambios locales.
- Migraciones existentes.
- docs/BLOCKERS.md.
- docs/audit/P0_REPORT.md.
- docs/audit/P0_REVIEW.md.
- docs/implementation/P0_HARDENING.md.

Conservar todo el trabajo preexistente.

No utilizar:

`git reset --hard`

`git clean -fd`

No hacer checkout que sobrescriba cambios legítimos.

Crear ramas nuevas desde el estado correcto y mantener trazabilidad con el trabajo P0.

---

# F01 — CIERRE DE P0.1: STAGING POSTGRESQL / SUPABASE

## OBJETIVO

Demostrar que las migraciones y restricciones de seguridad funcionan sobre un esquema representativo del entorno institucional.

### ACCIONES

1. Inspeccionar la estructura actual de producción utilizando exclusivamente operaciones de lectura.
2. Identificar propietarios, esquemas, tablas, secuencias, funciones y privilegios.
3. Crear o utilizar un staging aislado, aprobado y sin datos personales reales.
4. Reproducir el esquema de forma segura.
5. Validar que la migración P0 funciona sobre el estado representativo.
6. Validar idempotencia.
7. Comprobar reconciliación del ledger.
8. Comprobar privilegios.
9. Verificar RLS.
10. Validar reversa segura.

### PRUEBAS OBLIGATORIAS

- Base vacía.
- Base legacy.
- Migración repetida.
- Ledger faltante.
- Ledger alterado.
- Drift.
- Usuario sin privilegios.
- Usuario con rol de runtime.
- Usuario con rol de migración.
- Acceso entre instituciones.
- Defaults globales.
- Defaults scoped.
- Funciones/RPC.
- Auditoría.
- Rollback.

### RESTRICCIONES

No aplicar SQL sobre producción.

No utilizar producción como ambiente de pruebas.

No copiar datos personales reales a staging.

No editar checksums históricos para forzar aceptación.

No afirmar que staging fue validado si solamente se probó PostgreSQL local.

**ENTREGA:** evidencia de ensayo de migración y reporte de seguridad por esquema.

---

# F02 — ARGON2ID Y ENDURECIMIENTO DEL RUNTIME

Inspeccionar los parámetros actuales.

Verificar:

- Memoria.
- Iteraciones.
- Paralelismo.
- Concurrencia.
- Latencia.
- Pico RSS.
- Capacidad de hosting.
- Rate limiting.
- Consumo bajo carga.
- Timeouts.

Medir en el runtime de destino o en un entorno representativo aprobado.

No extrapolar las mediciones locales de Windows a producción.

### PRUEBAS

- Login válido.
- Login inválido.
- Usuario inexistente.
- Cuenta bloqueada.
- Cambio de contraseña.
- Revocación.
- Sesión expirada.
- Alta concurrencia.
- Saturación controlada.

Ajustar parámetros solamente con evidencia y sin debilitar arbitrariamente la seguridad.

Registrar resultados reproducibles.

---

# F03 — ACCESIBILIDAD REAL

Completar las pruebas pendientes de:

- Login.
- Cambio de contraseña.
- Catálogos.

### VALIDACIONES

- Navegación por teclado.
- Orden de tabulación.
- Foco.
- Errores asociados.
- Etiquetas.
- Anuncios de estado.
- Contraste.
- Formularios.
- Diálogos.
- Tablas.
- Paginación.
- Estados de carga.

Ejecutar pruebas con lector de pantalla real cuando exista una persona y un entorno disponibles.

Registrar:

- Herramienta.
- Versión.
- Navegador.
- Sistema operativo.
- Flujo.
- Resultado.
- Defectos.
- Correcciones.

No sustituir una validación manual pendiente por una prueba automatizada.

---

# F04 — REVISIÓN FINAL Y CIERRE CONTROLADO DE P0

Ejecutar nuevamente:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:ui
npm run build
npm audit
```

Verificar condiciones reales del entorno.

No ejecutar tests de integración sobre una base de datos de producción.

Solicitar revisión independiente del código corregido.

Cerrar únicamente los hallazgos respaldados por evidencia.

Actualizar docs/BLOCKERS.md sin borrar bloqueos no resueltos.

### MERGE DE P0

Si todas las condiciones de integración definidas están cumplidas:

1. Marcar el PR listo para revisión.
2. Confirmar CI del último SHA.
3. Obtener aprobaciones requeridas.
4. Fusionar respetando protecciones.
5. Confirmar SHA de main.
6. Repetir verificaciones.

Si faltan las puertas obligatorias, mantener P0 abierto.

No promover a producción.

---

# F05 — P1: IDENTIDAD Y AUTENTICACIÓN MULTIFACTOR

Comenzar sobre una rama dependiente del trabajo P0 o una base integrada compatible.

## IMPLEMENTAR MFA REAL

Priorizar TOTP mediante bibliotecas mantenidas.

Funciones:

- Registro de factor.
- Verificación.
- Activación.
- Códigos de recuperación.
- Revocación.
- Regeneración.
- Recuperación de cuenta.
- Auditoría.
- Step-up authentication para operaciones sensibles.

### SEGURIDAD

- Secretos cifrados.
- No exponer claves en logs.
- No guardar códigos de recuperación en texto plano.
- Limitar intentos.
- Prevenir replay.
- Invalidar desafíos expirados.
- Proteger contra reutilización.
- Revalidar sesiones.

No implementar un botón de MFA que simplemente devuelva éxito.

### UX/UI

Crear vistas de:

- Configuración.
- Activación.
- Verificación.
- Recuperación.
- Revocación.

Conservar identidad visual y componentes actuales.

---

# F06 — P1: GESTIÓN COMPLETA DE USUARIOS

Implementar:

- Alta.
- Edición.
- Activación.
- Suspensión.
- Baja lógica.
- Rehabilitación.
- Restablecimiento autorizado.
- Listado.
- Búsqueda.
- Filtros.
- Paginación.
- Historial.

## PERFILES INSTITUCIONALES

Soportar conforme al modelo de dominio:

- Superadministrador.
- Administrador institucional.
- Coordinador.
- Docente.
- Estudiante.
- Tutor.
- Invitado.

No asumir que todos los roles deben tener permisos globales.

Separar identidad de membresía institucional.

Una persona puede pertenecer a múltiples instituciones con diferentes permisos.

### BACKEND

- Validación estricta.
- Autorización por acción.
- Aislamiento tenant.
- Auditoría.
- Bloqueos transaccionales.
- Control de concurrencia.
- Prevención IDOR.
- Prevención mass assignment.

---

# F07 — P1: RBAC Y PERMISOS GRANULARES

Reutilizar el RBAC institucional existente.

Agregar un sistema de capacidades verificables en backend.

Ejemplos:

- institutions.read.
- institutions.manage.
- users.read.
- users.create.
- users.update.
- users.suspend.
- memberships.manage.
- roles.assign.
- programs.read.
- programs.manage.
- curricula.manage.
- courses.manage.
- groups.manage.
- enrollments.manage.
- grades.read.
- grades.manage.
- audit.read.

Los nombres finales deben adaptarse al dominio existente.

## REGLAS

No confiar en permisos enviados por frontend.

No permitir que un usuario otorgue privilegios superiores a los propios.

Verificar ámbito institucional.

Verificar relación con el recurso.

Verificar estado del recurso.

Proteger cambios de rol con transacciones.

Probar revocación concurrente.

Crear pruebas de matriz de permisos.

---

# F08 — P1: INVITACIONES Y VINCULACIÓN INSTITUCIONAL

Crear flujos para:

- Invitar usuario.
- Crear token seguro.
- Definir institución.
- Definir rol permitido.
- Definir caducidad.
- Aceptar invitación.
- Rechazar.
- Revocar.
- Reenviar.
- Registrar auditoría.

### EMAIL

Utilizar el proveedor de correo configurado si está disponible y autorizado.

Si no hay credenciales, implementar adaptador verificable y marcar entrega externa pendiente.

No inventar emails enviados.

### PROTECCIONES

- Tokens de un solo uso.
- Hash de tokens.
- Expiración.
- Rate limiting.
- Protección anti-enumeración.
- Prevención de escalación de permisos.

---

# F09 — P1: ADMINISTRACIÓN INSTITUCIONAL

Completar el panel de administración:

- Instituciones.
- Campus.
- Programas.
- Periodos académicos.
- Planes de estudio.
- Materias.
- Usuarios.
- Membresías.
- Roles.
- Permisos.
- Auditoría.
- Configuración.

Cada formulario debe tener:

- Validación.
- Persistencia.
- Estados de carga.
- Errores.
- Confirmaciones.
- Paginación.
- Navegación.
- Accesibilidad.

No desarrollar formularios decorativos.

### TRANSACCIONES

Mantener consistencia entre instituciones, programas, planes y materias.

Evitar registros huérfanos.

Respetar estados activos, archivados y publicados.

---

# F10 — P1: UX/UI PROFESIONAL

Conservar el sistema visual actual.

Implementar mejoras en:

- Login.
- Dashboard.
- Navegación por rol.
- Menús.
- Catálogos.
- Tablas.
- Búsquedas.
- Filtros.
- Formularios.
- Diálogos.
- Indicadores de carga.
- Estados vacíos.
- Errores.
- Accesibilidad.
- Responsive.
- Modo oscuro y claro si están soportados.

No duplicar layouts.

No destruir componentes funcionales.

Ejecutar pruebas Chromium de los recorridos principales.

---

# F11 — P1: SEGURIDAD, QA Y AUDITORÍA

## SEGURIDAD

Verificar:

- Tenant isolation.
- RBAC.
- MFA.
- Sesiones.
- CSRF.
- XSS.
- CSP.
- SQL injection.
- IDOR.
- Mass assignment.
- Privilegios PostgreSQL.
- RLS.
- Rate limiting.
- Auditoría.
- Dependencias.

## TESTS

Ejecutar:

- Unit tests.
- PostgreSQL integration tests.
- HTTP integration tests.
- Browser tests.
- Typecheck.
- Lint.
- Build.
- Dependency audit.

Ampliar cobertura sobre cada recurso y permiso añadido.

### REVISIÓN INDEPENDIENTE

Realizar dos pasadas:

**Primera:** encontrar defectos y brechas.

**Corrección:** resolver hallazgos con código y pruebas.

**Segunda:** verificar que las correcciones no introdujeron regresiones.

---

# F12 — GIT, CI Y RELEASE CONTROLADO

Trabajar con PR pequeños o medianos, cada uno entregando una capacidad funcional.

Ramas sugeridas:

- chore/p0-1-release-gates
- feat/p1-mfa
- feat/p1-user-management
- feat/p1-permission-scopes
- feat/p1-invitations
- feat/p1-institution-admin
- feat/p1-ux
- fix/p1-security-audit

### CICLO OBLIGATORIO

1. Actualizar base.
2. Crear rama.
3. Implementar.
4. Ejecutar pruebas.
5. Corregir.
6. Commit.
7. Push.
8. PR.
9. CI.
10. Revisión.
11. Merge aprobado.
12. Confirmar main.
13. Continuar.

Si P0 aún no puede fusionarse, utiliza ramas dependientes claramente identificadas.

No mezclar código P1 con el PR de endurecimiento P0 salvo correcciones necesarias para cerrar P0.

No desplegar a producción automáticamente.

---

# F13 — DEFINICIÓN DE TERMINADO

Una funcionalidad solo puede declararse COMPLETA cuando:

- Código implementado.
- Migraciones verificadas.
- API conectada.
- UI conectada.
- Persistencia real.
- Validación.
- Permisos.
- Auditoría.
- Tests.
- CI.
- PR fusionado.
- Evidencia reproducible.

Las integraciones externas y validaciones humanas deben declararse pendientes si no se ejecutaron.

### P0

No declarar cerrada la DoD hasta completar las puertas de BLOCKERS.md.

### P1

No declarar terminada la fase hasta comprobar los flujos completos de identidad, permisos, usuarios, invitaciones y administración.

---

# F14 — INFORME DE ENTREGA

Entregar al finalizar:

## GIT
- SHA inicial.
- SHA final.
- Ramas.
- Commits.
- PR.
- Estado de CI.
- Estado de merge.

## P0.1
- Staging.
- Migraciones.
- Reversa.
- RLS.
- Privilegios.
- Argon2id.
- Accesibilidad.
- Bloqueos restantes.

## P1
- MFA.
- Usuarios.
- RBAC.
- Invitaciones.
- Administración.
- UX/UI.
- Persistencia.
- Endpoints.

## SEGURIDAD
- Matriz de permisos.
- Aislamiento tenant.
- Pruebas negativas.
- Hallazgos.
- Correcciones.

## CALIDAD
- Typecheck.
- Lint.
- Unit tests.
- Integration tests.
- UI tests.
- Build.
- Audit.

## ESTADO FINAL
- COMPLETO.
- PARCIAL.
- BLOQUEADO.
- NO INICIADO.

No reportar una tarea como completa si solo existe su infraestructura.

---

# ORDEN FINAL

NO QUIERO OTRO PLAN DE TRABAJO.

QUIERO EJECUCIÓN REAL.

SINCRONIZA EL REPOSITORIO.

RESPETA EL PR #19 EXISTENTE.

CIERRA LAS PUERTAS P0 QUE PUEDAN VERIFICARSE.

NO TOQUES PRODUCCIÓN.

COMIENZA P1 SIN ESPERAR BLOQUEOS EXTERNOS.

IMPLEMENTA MFA REAL.

IMPLEMENTA USUARIOS Y SIETE PERFILES.

IMPLEMENTA PERMISOS GRANULARES.

IMPLEMENTA INVITACIONES.

IMPLEMENTA ADMINISTRACIÓN INSTITUCIONAL.

CONECTA NEXT.JS, API Y POSTGRESQL.

CORRIGE UX/UI.

EJECUTA PRUEBAS REALES.

REVISA SEGURIDAD.

CREA COMMITS.

HAZ PUSH.

ABRE PR.

VERIFICA CI.

FUSIONA LOS CAMBIOS APROBADOS.

CONTINÚA AUTOMÁTICAMENTE CON EL SIGUIENTE BLOQUE.

REALIZA AUDITORÍA POST-MERGE.

ENTREGA EVIDENCIA REAL.

**COMIENZA AHORA.**