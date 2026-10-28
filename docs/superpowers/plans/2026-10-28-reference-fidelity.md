# Fidelidad de referencia y entrada por perfil

**Objetivo:** reproducir la composición aprobada de 1344×896 manteniendo datos, permisos y operaciones institucionales. Referencia única SHA256 `756e6503bc292936fa507a5f3ad19d0abf2e313cfa053576820cd99f6104dcd3`.

**Ejecución:** en la rama `codex/siii-reference-fidelity-entry-20261028`, implementación nativa, revisión independiente al finalizar. La dirección visual ya está fijada por la solicitud; no se proponen alternativas.

## 1. Entrada y contexto

- [ ] Pruebas RED/GREEN de `resolveDashboardEntry`: estudiante/docente únicos, roles mixtos, varias instituciones, roles pendientes/sin acceso y contraseña obligatoria.
- [ ] Aplicar redirección desde `/dashboard` solo al destino personal inequívoco; selector para contextos personales ambiguos; conservar operación administrativa autorizada.
- [ ] Probar sesión autenticada real, revocación, MFA y enlaces directos.

## 2. Composición y materiales

- [ ] Shell personal acotado para estudiante/docente: rail x16/w198, contenido x232, encabezado y cuenta compactos; sin banner operativo personal.
- [ ] Estudiante: área principal w810 y lateral w274, hero y métricas, columnas 314/236/236, panel inferior y calendario a escala de la referencia. Proporciones fluidas a otras resoluciones.
- [ ] Fondo decorativo de campus sin textos/interfaz; paneles HTML translúcidos. Mantener las fuentes de datos existentes y las etiquetas que distinguen consultas de cifras oficiales.
- [ ] Estados vacíos/sin vínculo/cargando/error mantienen la cuadrícula y permiten recuperación. Docente comparte shell/materiales con funciones propias.

## 3. Evidencia y cierre

- [ ] Capturas autenticadas aisladas y estabilizadas en 1344×896, escritorio amplio y móvil; claro/oscuro; estudiante/docente; datos completos/vacíos.
- [ ] Contrato geométrico con tolerancia explícita y comparación contra el PNG aprobado: diferencia sin máscara, comparación visual estructural con máscaras dinámicas documentadas, overlay/diff y revisión manual. Nunca sustituir la referencia para esconder diferencias.
- [ ] Typecheck, lint, unitarias, PostgreSQL, perfiles outbox, Companion real, Playwright, build y audit; corregir regresiones.
- [ ] PR nuevo, revisión, CI verde, fusión y comprobación del deployment/SHA. El resultado visual se acredita con capturas y diferencias, no con estado READY.
