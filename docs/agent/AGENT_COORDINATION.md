# SIII — Coordinación de agentes · fase 1

## Alcance real

Esta entrega instala un **planificador determinista** de cinco especialidades (`ui`, `backend`, `security`, `qa`, `integration`). Ordena tareas por dependencias, evita asignar escrituras declaradas que se traslapan en una misma ola, permite reservar rutas tomadas por PRs abiertos y produce JSON/Markdown para auditoría.

**No ejecuta Codex ni otros modelos, no crea ramas de tarea, no hace commits/merge, no despliega y no toca la base de datos.** Las ramas de `workplan.json` son sugerencias. Una ola generada no representa trabajo terminado. Los patrones `writes` son una declaración de intención, **no un sandbox ni una verificación de cambios reales**.

## Reglas de operación

- Leer `AGENTS.md` y `docs/agent/MASTER_PROMPT.md`; comprobar `main`, PRs abiertos y CI antes de cada ejecución. El plan de ejemplo no certifica producción.
- Un agente / una rama / un PR por bloque. Contratos institucionales, seguridad, HMAC y migraciones exigen revisión especial y pruebas. Nunca ejecutar migraciones de producción desde agentes.
- Usar worktrees aislados y verificar `git diff --name-only` contra los reclamos `writes` antes de aceptar un cambio; los reclamos actuales no imponen restricciones en el filesystem.
- No compartir secretos de Supabase, Vercel, Render, Compañero o GitHub con prompts, PRs, CI público ni artefactos.
- **No conectar un ejecutor con permisos de escritura a contenido no confiable de PRs.** Esta workflow trabaja con `contents: read`, sin credenciales adicionales ni ejecución autónoma.

## Uso local (Node 22+)

```powershell
node --test tests/agents/*.test.mjs
node scripts/agents/plan.mjs --format markdown
node scripts/agents/plan.mjs --format json
```

Edita `scripts/agents/workplan.json` para adaptar tareas y dependencias. Los reclamos aceptados son archivos exactos como `src/middleware.ts` y prefijos de directorio como `src/app/api/**`. Se rechazan rutas absolutas, `..` y globs complejos. Las colisiones sólo comprueban rutas declaradas; **el coordinador humano también debe revisar dependencias semánticas**.

Si existe un PR que modifique la zona de una tarea, prepara un archivo local de reservas (no lo añadas al repo si contiene información sensible):

```json
[
  { "id": "pr-174", "writes": ["src/app/dashboard/**", "src/components/**"] }
]
```

```powershell
node scripts/agents/plan.mjs --reservations .\reservations.json --format markdown
```

La lista de reservas debe mantenerse actualizada con el diff real de los PRs; el planificador **no consulta GitHub**. Las tareas bloqueadas mantienen bloqueadas las que dependen de ellas.

## Bloques de trabajo y controles

1. **Entregado en este PR:** planificación segura, dependencias, exclusión por archivos, reserva de PRs, pruebas y GitHub Actions de reporte.
2. **Por implementar fuera de este entorno:** conectar Codex CLI o un servicio de agentes con runtime aislado, autenticación, presupuestos, observabilidad, permisos mínimos, worktrees y autorización de tareas. La workflow actual no ejecuta IA.
3. **Integración:** cada tarea necesita PR y evidencia real de lint, tipos, unitarias, integración PostgreSQL, build, UI/Playwright y contrato Compañero cuando aplique. No fusionar sin `Verify SIS` completamente verde, revisión y conflictos resueltos.
4. **Producción:** verificar aparte Vercel, Supabase, Render y sincronización real; un CI verde por sí solo no acredita operación productiva.

`.github/workflows/agent-coordination.yml` puede ejecutarse manualmente o al abrir un PR que cambie la coordinación. Ejecuta seis pruebas sin instalar paquetes y publica únicamente artefactos de planificación. No habilita auto-merge ni escribe en otros servicios.
