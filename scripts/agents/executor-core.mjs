/**
 * Safe, local-only helpers for an opt-in Codex runner.
 * Nothing in this module launches a process or authorizes a merge.
 */
import { claimsOverlap } from './coordinator.mjs';

const KEYS = new Set([
  'PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR',
  'USER', 'USERNAME', 'LANG', 'LC_ALL', 'PATHEXT', 'COMSPEC',
  'CODEX_HOME', 'OPENAI_API_KEY',
]);

export function agentEnvironment(source = process.env) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (KEYS.has(key) && typeof value === 'string') result[key] = value;
  }
  result.NO_COLOR = '1';
  return result;
}

export function buildAgentPrompt(task, commit) {
  if (!task || !Array.isArray(task.writes) || !task.writes.length) {
    throw new Error('Task needs explicit ownership claims');
  }
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Base SHA must be an immutable commit');
  const scope = task.writes.map((file) => `- ${file}`).join('\n');
  return [
    'Eres agente especializado en SIII. Trabajas en un worktree AISLADO.',
    'Primero lee AGENTS.md y docs/agent/MASTER_PROMPT.md. Respeta sus invariantes.',
    `Tarea: ${task.title}. Especialidad: ${task.agent}. Commit base: ${commit}.`,
    '', 'Archivos DIRECTAMENTE autorizados para cambios:', scope,
    '',
    'No modifiques otros archivos. Si necesitas alterar otro archivo, para y reporta el bloqueo.',
    'No crees commits, no pushes, no abras PR, no hagas merge ni deploy.',
    'No uses ni reveles secretos, claves, datos institucionales reales ni credenciales.',
    'No ejecutes migraciones en producción ni cambies configuración de seguridad sin aprobación.',
    'Prioriza cambios verificables; ejecuta pruebas proporcionadas por el repo cuando sea posible.',
    'Al final entrega archivos cambiados, pruebas efectivamente ejecutadas y riesgos pendientes.',
    'Si tu tarea es solo auditoría y no encuentras defectos, no inventes cambios.',
  ].join('\n');
}

export function unexpectedChanges(paths, claims) {
  if (!Array.isArray(paths) || !Array.isArray(claims) || !claims.length) {
    throw new Error('Both changed paths and ownership claims must be provided');
  }
  return [...new Set(paths)].filter((changed) => {
    if (typeof changed !== 'string' || !changed || changed.startsWith('/') ||
        changed.split('/').some((part) => part === '..' || part === '.')) return true;
    return !claims.some((allowed) => claimsOverlap(allowed, changed));
  });
}

export function selectFirstWave(plan, schedule) {
  // Every later wave has either a dependency on a prior wave or a write conflict.
  // Running later waves from the old base would give dependent agents stale code.
  if (schedule.waves.length === 0) return [];
  const selected = schedule.waves[0].tasks;
  for (const task of selected) {
    if (task.dependsOn.length) throw new Error('A dependent task needs its predecessors merged first');
    if (!plan.tasks.some((original) => original.id === task.id)) {
      throw new Error('Scheduled task does not belong to manifest');
    }
  }
  return selected;
}

export function assertTrustedRepoContext({ branch, head, originMain, remote, porcelain }) {
  if (branch !== 'main') throw new Error('Run from local main only');
  if (!/^[a-f0-9]{40}$/.test(head) || head !== originMain) {
    throw new Error('Local HEAD differs from origin/main; fetch/pull and retry');
  }
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(?:ErickRFM\/Siii)(?:\.git)?\/?$/i.test(remote.trim())) {
    throw new Error('Git origin does not point to ErickRFM/Siii');
  }
  if (porcelain !== '') throw new Error('Working tree must be clean');
}
