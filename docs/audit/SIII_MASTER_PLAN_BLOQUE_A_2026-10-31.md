# SIII — Auditoría inicial, cierre de versiones y matriz de deuda (Bloque A)

**Fecha:** 31 de octubre de 2026  
**Rama base:** `main`  
**Commit de referencia:** `d3b8e3cf` (Merge PR #155)  
**Estado de PRs:** 0 abiertos (100% integrados y archivados)  
**Estado CI:** Verify SIS verde en PR #155 y ejecutando en `main`

---

## 1. Verificación de versiones y despliegue

### 1.1 Estado de Git y Pull Requests
- **Trunk real:** `main`.
- **Integraciones reconciliadas en esta sesión:**
  1. PR #153: `67bb21f9` (*fix(ux/perf): compactar portales personales, tablas legibles y evitar consultas innecesarias*).
  2. PR #154: `06fac078` (*refactor(css): iniciar limpieza comprobable, eliminar duplicados y bloquear nuevas reglas idénticas*).
  3. PR #155: `d3b8e3cf` (*refactor(css): asignar propietarios únicos a tablas, filtros y encabezados*).
- **PRs abiertos:** Ninguno (`gh pr list --state open` devuelve 0).

### 1.2 Estado de Integración Continua (CI)
- **Suite de GitHub Actions (`Verify SIS`):**
  - `Companion live contract`: Aprobado (5m 30s)
  - `ui` (Playwright + accesibilidad): Aprobado (15m 18s)
  - `verify` (Lint, types, unit tests, integration tests, DB migration, build): Aprobado (13m 7s)
- **Verificación local:**
  - `npm run typecheck`: 0 errores.
  - `npm run lint`: 0 advertencias / errores.
  - `node scripts/audit-css.mjs`: Aprobado (254,140 bytes, 432 `!important`, 437 duplicados).
  - `node scripts/css-cleanup.mjs --check`: 0 duplicados exactos.
  - `node scripts/css-owner-gate.mjs`: 17 selectores y 34 propiedades verificadas con propietario único.
  - `npm test`: 1,036 pruebas unitarias aprobadas.

### 1.3 Estado de Vercel y Producción
- **URL productiva oficial:** `https://siii-three.vercel.app`
- **Sondeo en vivo:**
  - `GET /api/ready`: `HTTP 200 OK` → `{"status":"ready","database":"connected"}`
  - `GET /api/health`: `HTTP 200 OK` → `{"status":"ok"}`
  - Cabeceras de seguridad verificadas: `Content-Security-Policy` con nonces, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`.
- **Alerta de despliegue Vercel:**
  La cuenta Vercel (`er-i1`) reporta límite de tasa alcanzado:  
  `Deployment rate limited — retry in 24 hours. https://vercel.com/er-i1?upgradeToPro=build-rate-limit`.  
  El deployment productivo activo corresponde a `06fac078` (PR #154). La actualización al SHA `d3b8e3cf` se consolidará automáticamente una vez venza la ventana del rate limit de Vercel.

---

## 2. Inventario exhaustivo del sistema

### 2.1 Perfiles y Roles (RBAC)
Implementados en `src/shared/auth/roles.ts` y gobernados por `policy.ts`:
1. `student` (Estudiante)
2. `workshop_participant` (Participante de taller)
3. `workshop_facilitator` (Facilitador de taller)
4. `teacher_pending` (Docente en proceso de acreditación)
5. `teacher` (Docente titular)
6. `tutor` (Tutor académico)
7. `control_escolar` (Control escolar institucional)
8. `coordinator` (Coordinador de programa)
9. `admin` (Administrador institucional)
10. `super_admin` (Superadministrador de plataforma)

### 2.2 Páginas y Vistas (`src/app`)
- **Públicas y Autenticación:**
  - `/` (Home institucional)
  - `/login` (Acceso con MFA y sesión por cookies seguras)
  - `/password/forgot` y `/password/reset` (Recuperación con token criptográfico)
  - `/invitations/accept` (Aceptación de invitaciones institucionales)
  - `/admissions/[institutionId]` y `/admissions/verify` (Portal y verificación de admisiones)
- **Dashboard Institucional:**
  - `/dashboard` (Selector y despacho de instituciones)
  - `/dashboard/security` (Gestión de credenciales y MFA TOTP)
  - `/dashboard/institutions/[id]` (Vista general institucional)
  - `/dashboard/institutions/[id]/admin` (Administración central)
  - `/dashboard/institutions/[id]/users` (Gestión de usuarios y membresías)
  - `/dashboard/institutions/[id]/roles` (Asignación y revocación RBAC)
  - `/dashboard/institutions/[id]/academic` (Catálogo de programas, materias, planes y periodos)
  - `/dashboard/institutions/[id]/admissions` (Gestión de aspirantes y convocatorias)
  - `/dashboard/institutions/[id]/scheduling` (Aulas, franjas y distribución de horarios)
  - `/dashboard/institutions/[id]/operations` (Grupos, secciones y asignaciones)
  - `/dashboard/institutions/[id]/registry` (Expedientes escolares y matrículas)
  - `/dashboard/institutions/[id]/grading` y `/grading/corrections` (Actas y rectificaciones oficiales)
  - `/dashboard/institutions/[id]/financials` (Caja, cuotas y conceptos de pago)
  - `/dashboard/institutions/[id]/services` (Constancias, talleres y servicios universitarios)
  - `/dashboard/institutions/[id]/student` y `/student/attendance` (Portal de estudiante y asistencias)
  - `/dashboard/institutions/[id]/teacher` (Portal docente y pase de lista)

### 2.3 Arquitectura de Componentes
- **Componentes de Dominio (`src/components`):** 48 componentes (ej. `personal-portal.tsx`, `teacher-portal.tsx`, `academic-catalog.tsx`, `financial-workspace.tsx`, `admissions-portal.tsx`, `school-registry.tsx`, etc.).
- **Primitivas UI (`src/components/ui`):** 27 componentes (Radix + Tailwind: `button`, `card`, `dialog`, `dropdown-menu`, `input`, `select`, `table`, `tabs`, `sheet`, `sidebar`, `sii-kit`, `siii-glass-kit`).

### 2.4 Hojas de Estilo y CSS
- **17 hojas globales importadas en `src/app/layout.tsx`:**
  `globals.css`, `sii-v2.css`, `academic-v2.css`, `sii-ux-refinement.css`, `sii-motion-polish.css`, `sii-system-coherence.css`, `sii-premium-kit.css`, `sii-kit-components.css`, `sii-interactions.css`, `sii-tailwind.css`, `sii-workspaces.css`, `sii-glass.css`, `sii-personal-fidelity.css`, `sii-v5-theme.css`, `sii-admin-coherence.css`, `sii-table-responsive.css`, `sii-personal-mobile.css`.
- **2 hojas modulares:** `institution-admin.css`, `institution-users.css`.
- **Métricas:** 254,140 bytes de CSS | 432 declaraciones `!important` | 437 selectores repetidos en el mismo archivo.

---

## 3. Línea base visual y funcional

### 3.1 Snapshots de Referencia Aprobados
Ubicados en `tests/ui/visual-baselines/`:
- `login-dark-1440.png` / `login-light-1440.png`
- `login-dark-390.png` / `login-light-390.png`
- `student-dark-1344.png` / `student-light-1344.png`
- `student-dark-390.png` / `student-light-390.png`
- `teacher-dark-1344.png` / `teacher-light-1344.png`
- `teacher-dark-390.png` / `teacher-light-390.png`
- **Fidelidad canónica:** `docs/design/reference/siii-glass-approved.png` (807,410 bytes).

### 3.2 Cobertura de Viewports Evaluados
- **Escritorio:** 1666px, 1440px, 1344px, 1024px.
- **Tablet:** 768px.
- **Móvil:** 430px, 390px, 360px, 320px.

---

## 4. Matriz de deuda técnica y riesgos

| Nivel | ID | Descripción del problema | Impacto | Bloque del Plan |
|:---:|:---:|---|---|:---:|
| **P0** | D01 | **Límite de tasa en Vercel (Hobby):** Despliegues automatizados bloqueados temporalmente por cuota de 100 builds/24h. | Producción requiere ventana de espera para reflejar commits recientes. | Bloque A / H |
| **P0** | D02 | **Dispersión de estilos (19 archivos CSS):** Sobrescritura en cascada con 432 `!important` que genera especificidades impredecibles entre módulos. | Conflictos visuales al ajustar componentes compartidos. | Bloque C |
| **P0** | D03 | **Ausencia de `SiiDataTable` unificado:** Módulos de Catálogo, Estudiante, Docente y Administración usan implementaciones de tabla HTML independientes con diferentes soluciones de scroll responsive. | Desbordamientos en pantallas < 430px y experiencia visual fracturada. | Bloque D |
| **P1** | D04 | **Duplicación de layouts (`SiiAppShell` / `SiiPageLayout`):** El sidebar institucional, navegación móvil y cabeceras tienen wrappers inconsistentes en portales personales vs. administrativos. | Experiencia de navegación desarticulada entre roles. | Bloque B / E |
| **P1** | D05 | **Disparidad de temas (Día vs. Noche):** Modificadores `.sii-v5-theme` y variables CSS aplicadas con selectores dispares (`html[data-sii-theme="dark"]` vs `html.dark`). | Inconsistencia de contrastes y sombras glass en modo claro. | Bloque C |
| **P1** | D06 | **Filtros y búsquedas dispersos:** Catálogos y usuarios implementan sus propias barras de búsqueda (`.sii-catalog-toolbar`, `.sii-workspace-filters`). | Dificultad para mantener accesibilidad y debounce homogéneo. | Bloque B / D |
| **P2** | D07 | **Bundle de CSS sobredimensionado:** 254 KB de CSS con reglas y selectores obsoletos de migraciones anteriores no purgados. | Mayor tiempo de carga inicial en redes móviles. | Bloque C / F |
| **P2** | D08 | **Scripts de reconciliación histórica en la raíz de `scripts/`:** Coexisten múltiples scripts de prueba y recuperación (`rehearse-*`, `baseline-recovery`). | Aumento de complejidad cognitiva en el mantenimiento. | Bloque F |

---

## 5. Criterio de Cierre de Bloque A

- [x] Rama `main` verificada y alineada con remoto (`d3b8e3cf`).
- [x] PR #155 certificado e integrado sin conflictos.
- [x] 0 PRs abiertos pendientes en el repositorio.
- [x] Despliegue de producción verificado y operativo en `siii-three.vercel.app`.
- [x] Inventario completo de 41 endpoints, 17 páginas, 10 roles y 75 componentes.
- [x] Línea base visual y técnica documentada.
- [x] Matriz de deuda técnica clasificada en P0, P1 y P2.

**Estado:** **BLOQUE A CERRADO SATISFACTORIAMENTE**. Listo para proceder con la ejecución de **R1 / Bloque B (Arquitectura de Componentes)**.
