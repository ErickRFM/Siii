/**
 * Read-only SIII work planner. Never runs tools, writes to Git, merges, or deploys.
 * Claims are literal files or directories ending in /**; no implicit glob expansion.
 */
const AGENTS = new Set(['ui', 'backend', 'security', 'qa', 'integration']);
const ID = /^[a-z][a-z0-9-]{1,47}$/;
const BRANCH = /^(?:codex|feat|fix)\/[a-z0-9][a-z0-9-]{1,80}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function claim(value) {
  assert(typeof value === 'string' && value.length > 0, 'Write claim must be a string');
  const isDirectory = value.endsWith('/**');
  const path = isDirectory ? value.slice(0, -3) : value;
  assert(
    path.length > 0 && !path.startsWith('/') && !path.includes('\\') &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..') &&
      /^[a-zA-Z0-9_@().\/-]+$/.test(path),
    `Unsafe or unsupported write claim: ${value}`,
  );
  return { path, isDirectory };
}

export function claimsOverlap(left, right) {
  const a = claim(left);
  const b = claim(right);
  if (a.path === b.path) return true;
  if (a.isDirectory && b.path.startsWith(`${a.path}/`)) return true;
  if (b.isDirectory && a.path.startsWith(`${b.path}/`)) return true;
  return false;
}

export function validateWorkplan(plan) {
  assert(plan && typeof plan === 'object' && !Array.isArray(plan), 'Workplan must be an object');
  assert(plan.version === 1, 'Unsupported workplan version');
  assert(plan.repository === 'ErickRFM/Siii', 'Workplan must target ErickRFM/Siii');
  assert(plan.base === 'main', 'SIII work must target main');
  assert(Array.isArray(plan.tasks) && plan.tasks.length > 0 && plan.tasks.length <= 30,
    'Workplan must contain 1–30 tasks');
  const ids = new Set();
  for (const task of plan.tasks) {
    assert(task && typeof task === 'object', 'Invalid task');
    assert(typeof task.id === 'string' && ID.test(task.id), `Invalid task ID: ${task.id}`);
    assert(!ids.has(task.id), `Duplicate task: ${task.id}`);
    ids.add(task.id);
    assert(AGENTS.has(task.agent), `Unknown agent for ${task.id}`);
    assert(typeof task.title === 'string' && task.title.trim().length >= 5,
      `Missing title for ${task.id}`);
    assert(typeof task.branch === 'string' && BRANCH.test(task.branch),
      `Invalid branch for ${task.id}`);
    assert(Array.isArray(task.writes) && task.writes.length > 0,
      `Missing file ownership claims for ${task.id}`);
    for (const path of task.writes) claim(path);
    assert(new Set(task.writes).size === task.writes.length, `Duplicate write claims for ${task.id}`);
    assert(Array.isArray(task.dependsOn), `Missing dependsOn for ${task.id}`);
    assert(new Set(task.dependsOn).size === task.dependsOn.length,
      `Duplicate dependencies for ${task.id}`);
  }
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    assert(!visiting.has(id), `Dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) {
      assert(byId.has(dependency), `Unknown dependency ${dependency} in ${id}`);
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of plan.tasks) visit(task.id);
  return plan;
}

export function buildSchedule(rawPlan, reservations = []) {
  const plan = validateWorkplan(rawPlan);
  assert(Array.isArray(reservations), 'Reservations must be an array');
  const normalizedReservations = reservations.map((reservation) => {
    assert(reservation && typeof reservation.id === 'string' && ID.test(reservation.id),
      'Reservation must have a valid ID');
    assert(Array.isArray(reservation.writes) && reservation.writes.length > 0,
      `Reservation ${reservation.id} must have write claims`);
    for (const path of reservation.writes) claim(path);
    return reservation;
  });
  const done = new Set();
  const waves = [];
  const sorted = [...plan.tasks].sort((a, b) => a.id.localeCompare(b.id));
  while (done.size < sorted.length) {
    const ready = sorted.filter((task) => !done.has(task.id) &&
      task.dependsOn.every((dependency) => done.has(dependency)));
    const selected = [];
    for (const task of ready) {
      const reserved = normalizedReservations.some((item) =>
        task.writes.some((path) => item.writes.some((other) => claimsOverlap(path, other))));
      if (reserved) continue;
      const collision = selected.some((otherTask) =>
        task.writes.some((path) => otherTask.writes.some((other) => claimsOverlap(path, other))));
      if (!collision) selected.push(task);
    }
    if (selected.length === 0) break;
    waves.push({ number: waves.length + 1, tasks: selected });
    for (const task of selected) done.add(task.id);
  }
  const blocked = sorted.filter((task) => !done.has(task.id)).map((task) => {
    const reservation = normalizedReservations.find((item) =>
      task.writes.some((path) => item.writes.some((other) => claimsOverlap(path, other))));
    return {
      id: task.id,
      reason: reservation ? `reserved by ${reservation.id}` :
        `waiting on ${task.dependsOn.filter((id) => !done.has(id)).join(', ')}`,
    };
  });
  return {
    repository: plan.repository,
    base: plan.base,
    mode: 'plan-only',
    waves,
    blocked,
    policy: 'No autonomous execution, merge, secret access, or deployment.',
  };
}

export function renderMarkdown(schedule) {
  const lines = [
    '# SIII · Plan de coordinación (solo planificación)',
    '',
    `Base: \`${schedule.repository}@${schedule.base}\`. No se ejecutan agentes ni merges.`,
    '',
    '| Ola | Agente | Tarea | Rama propuesta |',
    '| --- | --- | --- | --- |',
  ];
  for (const wave of schedule.waves) {
    for (const task of wave.tasks) {
      lines.push(`| ${wave.number} | ${task.agent} | ${task.id} — ${task.title} | \`${task.branch}\` |`);
    }
  }
  if (schedule.blocked.length) {
    lines.push('', '## Bloqueos');
    for (const item of schedule.blocked) lines.push(`- \`${item.id}\`: ${item.reason}`);
  }
  lines.push('', '**Puerta de integración:** revisar alcance real, PR, CI completo verde y aprobación humana.');
  return lines.join('\n') + '\n';
}
