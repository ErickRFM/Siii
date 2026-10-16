export type Role = 'student' | 'workshop_participant' | 'teacher_pending' | 'teacher' | 'tutor' | 'coordinator' | 'admin' | 'super_admin' | 'guest' | 'control_escolar' | 'workshop_facilitator';
export type Permission = 'institutions.read' | 'users.read' | 'users.manage' | 'roles.assign' | 'academic.read' | 'academic.manage' | 'grades.read' | 'grades.publish' | 'integrations.manage' | 'audit.read';
const matrix: Record<Role, readonly Permission[]> = {
  guest:['institutions.read'],
  control_escolar:['institutions.read','users.read','academic.read','grades.read'],
  workshop_facilitator:['institutions.read','academic.read','grades.read'],
  student: ['institutions.read','academic.read','grades.read'],
  workshop_participant: ['institutions.read'],
  teacher_pending: ['institutions.read'],
  teacher: ['institutions.read','academic.read','grades.read','grades.publish'],
  tutor: ['institutions.read','academic.read'],
  coordinator: ['institutions.read','users.read','academic.read','academic.manage','grades.read'],
  admin: ['institutions.read','users.read','users.manage','roles.assign','academic.read','academic.manage','grades.read','integrations.manage','audit.read'],
  super_admin: ['institutions.read','users.read','users.manage','roles.assign','academic.read','academic.manage','grades.read','grades.publish','integrations.manage','audit.read'],
};
export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some(role => matrix[role]?.includes(permission));
}
// Super-administrator assignment is a privileged provisioning operation, not an ordinary role grant.
// Institutional admins may not mint new institutional admins: only super-admins can grant admin.
// The route additionally prevents self-grants and verifies institution membership.
export function canGrantRole(actorRoles: readonly Role[], targetRole: Role): boolean {
  if (targetRole === 'super_admin') return false;
  if (targetRole === 'admin') return actorRoles.includes('super_admin');
  return actorRoles.includes('admin') || actorRoles.includes('super_admin');
}

/**
 * Granting or revoking lower-privilege access to other memberships must never
 * allow an institutional admin to administer a super administrator or peer admin.
 * The HTTP layer separately enforces identity, institution scope and no self-edit.
 */
export function canManageMembership(actorRoles: readonly Role[], targetRoles: readonly Role[]): boolean {
  if (targetRoles.includes('super_admin')) return false;
  if (targetRoles.includes('admin')) return actorRoles.includes('super_admin');
  return actorRoles.includes('admin') || actorRoles.includes('super_admin');
}

export const ROLE_LABELS: Record<Role, string> = {
  guest:'Invitado',control_escolar:'Control escolar',workshop_facilitator:'Facilitador de taller',
  student:'Estudiante',workshop_participant:'Participante',teacher_pending:'Docente pendiente',teacher:'Docente',
  tutor:'Tutor académico',coordinator:'Coordinación',admin:'Administración',super_admin:'Superadministración',
};
