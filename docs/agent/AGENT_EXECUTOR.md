# SIII · Ejecutor de agentes con Codex CLI (bloque 2)

## Entregado
- Runner **opt-in** `scripts/agents/run.mjs`: valida repositorio limpio, `main = origin/main`, permisos y reservas; crea worktrees separados por tarea y puede lanzar hasta cuatro instancias locales de `codex exec` en sandbox `workspace-write`.
- Valida los archivos modificados contra el alcance declarado. Un cambio fuera de `writes` queda bloqueado en el reporte; nunca se integra automáticamente.
- Ejecuta **solo la primera ola independiente**. Las olas dependientes se detienen hasta fusionar PRs previos, rebasar `main` y replanificar.
- Dashboard local `scripts/agents/dashboard.mjs`, únicamente en `127.0.0.1:4318`, muestra actividades reales con refresco de 2 s. No expone rutas locales, logs en bruto ni secretos; no ofrece acciones de escritura.
- Pruebas automáticas para aislamiento de variables de entorno, rutas de trabajo, etapas y privacidad del panel.

## Requisitos locales
1. Node.js 22+, Git y Codex CLI oficial instalado y autenticado. Comprobar `codex --version` y `codex login`.
2. Repositorio SIII en un clon local limpio; en `main` actualizado con `origin/main`.
3. Archivo local de reservas de PRs abiertos con alcance real. El runner no consulta GitHub automáticamente; revisar las reservas antes de cada ejecución.
4. En Windows, usar una ruta de proyecto sin caracteres especiales de CMD (se rechazan rutas inseguras). Codex debe aplicar su sandbox correctamente.

## PowerShell
```powershell
cd C:\proyectos\esc
git switch main
git fetch origin
git pull --ff-only
git status --short
codex --version

# Mostrar el plan, sin iniciar agentes
node scripts/agents/run.mjs

# Terminal independiente: panel de solo lectura
node scripts/agents/dashboard.mjs
# http://127.0.0.1:4318
```

Preparar `.p0-local/agent-reservations.json` a partir del diff completo de los PRs activos. Mientras #174 esté abierto, reservar sus rutas de CSS, componentes, pruebas UI y `.github/workflows/verify.yml` (no es una lista estática para siempre). Un ejemplo de formato:

```json
[
  {"id":"pr-174","writes":["src/app/sii-personal-fidelity.css","src/components/teacher-portal.tsx","src/components/institution-capabilities.tsx","tests/ui/personal-portals.spec.ts",".github/workflows/verify.yml"]}
]
```

Ejecutar **solo tras verificar reservas y condiciones**:

```powershell
node scripts/agents/run.mjs --execute --reservations .p0-local/agent-reservations.json --max-parallel 2 --timeout-minutes 40
```

Los worktrees se guardan fuera del repositorio en `..\.siii-agent-worktrees\<task-id>`. El resultado se almacena en `..\.siii-agent-runs\<fecha>\report.json`. No se crean PRs ni merges automáticos y no se limpian cambios sin revisión humana.

## Cierre por bloque
Revisar el diff, ejecutar pruebas del alcance, corregir conflictos, abrir PR de cada especialidad, verificar `Verify SIS` (incluidos `verify`, `ui`, `Companion live contract`), y comprobar Vercel si aplica. **Fusionar solo cuando el CI de la última revisión esté verde**. Retirar del plan las tareas integradas antes de la siguiente ola.

## Límites
Este mecanismo prepara la ejecución **en un runtime externo**; ChatGPT no inicia el Codex local del usuario. No equivale a un aislamiento de seguridad completo: `workspace-write` debe funcionar y se recomienda un entorno descartable si se procesa código no confiable. Los controles de escritura fuera de alcance se detectan al terminar, no protegen el disco en tiempo real. No debe usarse con credenciales o datos productivos. El runner restringe la herencia de variables de entorno (permite credencial Codex opcional `OPENAI_API_KEY`), no pasa tokens de GitHub/Vercel/Supabase/Render, y nunca llama a `git push`, `git merge` o despliegues.
