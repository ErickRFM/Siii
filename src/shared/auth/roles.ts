export type Role = 'student' | 'workshop_participant' | 'teacher_pending' | 'teacher' | 'tutor' | 'coordinator' | 'admin' | 'super_admin';
export type Permission = 'institutions.read' | 'users.read' | 'users.manage' | 'roles.assign' | 'academic.read' | 'academic.manage' | 'grades.read' | 'grades.publish' | 'integrations.manage' | 'audit.read';
const matrix: Record<Role, readonly Permission[]> = {
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
// Administrative role grants MUST be deliberately scoped and never self-assigned.
export function canGrantRole(actorRoles: readonly Role[], targetRole: Role): boolean {
  return targetRole !== 'super_admin' && (actorRoles.includes('admin') || actorRoles.includes('super_admin'));
}
export const ROLE_LABELS: Record<Role, string> = {
  student:'Estudiante',workshop_participant:'Participante',teacher_pending:'Docente pendiente',teacher:'Docente',
  tutor:'Tutor académico',coordinator:'Coordinación',admin:'Administración',super_admin:'Superadministración',
};
