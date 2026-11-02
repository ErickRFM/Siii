import type {Route} from 'next';

export type StudentNavSection = 'home' | 'academic' | 'orders' | 'services' | 'profile';
export type StudentAcademicView = 'courses' | 'teachers' | 'grades';
export type TeacherNavSection = 'home' | 'groups' | 'evaluations' | 'profile';

export type PersonalNavDestination = {
  id: string;
  label: string;
  hash: string;
  section: string;
  subView?: string;
  iconName: 'home' | 'book' | 'grades' | 'wallet' | 'layers' | 'users' | 'clipboard' | 'file' | 'settings' | 'user';
  groupLabel: string;
  role: 'student' | 'teacher' | 'context';
  available: boolean;
  description?: string;
};

export const STUDENT_NAV_ITEMS: readonly PersonalNavDestination[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    hash: 'inicio',
    section: 'home',
    iconName: 'home',
    groupLabel: 'General',
    role: 'student',
    available: true,
    description: 'Resumen institucional y avisos recientes.',
  },
  {
    id: 'calificaciones',
    label: 'Calificaciones',
    hash: 'calificaciones',
    section: 'academic',
    subView: 'grades',
    iconName: 'grades',
    groupLabel: 'Académico',
    role: 'student',
    available: true,
    description: 'Calificaciones finales publicadas y registro de periodos.',
  },
  {
    id: 'historial',
    label: 'Historial académico',
    hash: 'historial',
    section: 'academic',
    subView: 'grades',
    iconName: 'book',
    groupLabel: 'Académico',
    role: 'student',
    available: true,
    description: 'Consulta oficial del kárdex informativo.',
  },
  {
    id: 'inscripciones',
    label: 'Carga académica',
    hash: 'inscripciones',
    section: 'academic',
    subView: 'courses',
    iconName: 'clipboard',
    groupLabel: 'Académico',
    role: 'student',
    available: true,
    description: 'Asignaturas e inscripciones activas del periodo.',
  },
  {
    id: 'plan',
    label: 'Plan de estudios',
    hash: 'plan',
    section: 'academic',
    subView: 'courses',
    iconName: 'file',
    groupLabel: 'Académico',
    role: 'student',
    available: false,
    description: 'Retícula curricular en desarrollo por Control Escolar.',
  },
  {
    id: 'finanzas',
    label: 'Estado de cuenta',
    hash: 'finanzas',
    section: 'orders',
    iconName: 'wallet',
    groupLabel: 'Financiero',
    role: 'student',
    available: true,
    description: 'Consulta de saldos, cargos y abonos confirmados.',
  },
  {
    id: 'ordenes',
    label: 'Órdenes de pago',
    hash: 'ordenes',
    section: 'orders',
    iconName: 'wallet',
    groupLabel: 'Financiero',
    role: 'student',
    available: true,
    description: 'Desglose de cuotas y fechas límite de pago.',
  },
  {
    id: 'comprobantes',
    label: 'Comprobantes',
    hash: 'comprobantes',
    section: 'orders',
    iconName: 'file',
    groupLabel: 'Financiero',
    role: 'student',
    available: true,
    description: 'Movimientos e historial de pagos confirmados.',
  },
  {
    id: 'tramites',
    label: 'Mis trámites',
    hash: 'tramites',
    section: 'services',
    iconName: 'layers',
    groupLabel: 'Trámites',
    role: 'student',
    available: true,
    description: 'Solicitudes y seguimiento de atención institucional.',
  },
  {
    id: 'solicitudes',
    label: 'Solicitudes',
    hash: 'solicitudes',
    section: 'services',
    iconName: 'clipboard',
    groupLabel: 'Trámites',
    role: 'student',
    available: true,
    description: 'Generación y envío de nuevas solicitudes.',
  },
  {
    id: 'documentos',
    label: 'Documentos',
    hash: 'documentos',
    section: 'services',
    iconName: 'file',
    groupLabel: 'Trámites',
    role: 'student',
    available: true,
    description: 'Historial de folios y constancias generadas.',
  },
  {
    id: 'docentes',
    label: 'Mis docentes',
    hash: 'docentes',
    section: 'academic',
    subView: 'teachers',
    iconName: 'users',
    groupLabel: 'Comunidad',
    role: 'student',
    available: true,
    description: 'Profesores asignados a tus asignaturas vigentes.',
  },
  {
    id: 'avisos',
    label: 'Avisos institucionales',
    hash: 'avisos',
    section: 'home',
    iconName: 'users',
    groupLabel: 'Comunidad',
    role: 'student',
    available: true,
    description: 'Comunicados y publicaciones generales de la institución.',
  },
  {
    id: 'perfil',
    label: 'Mi perfil',
    hash: 'perfil',
    section: 'profile',
    iconName: 'user',
    groupLabel: 'Perfil',
    role: 'student',
    available: true,
    description: 'Datos personales y estado académico oficial.',
  },
] as const;

export const TEACHER_NAV_ITEMS: readonly PersonalNavDestination[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    hash: 'inicio',
    section: 'home',
    iconName: 'home',
    groupLabel: 'Docencia',
    role: 'teacher',
    available: true,
    description: 'Resumen de docencia y acceso rápido a grupos.',
  },
  {
    id: 'grupos',
    label: 'Mis grupos',
    hash: 'grupos',
    section: 'groups',
    iconName: 'users',
    groupLabel: 'Docencia',
    role: 'teacher',
    available: true,
    description: 'Asignaturas asignadas y listas oficiales.',
  },
  {
    id: 'evaluaciones',
    label: 'Evaluaciones',
    hash: 'evaluaciones',
    section: 'evaluations',
    iconName: 'clipboard',
    groupLabel: 'Docencia',
    role: 'teacher',
    available: true,
    description: 'Captura y publicación del libro de calificaciones.',
  },
  {
    id: 'perfil',
    label: 'Mi perfil',
    hash: 'perfil',
    section: 'profile',
    iconName: 'user',
    groupLabel: 'Docencia',
    role: 'teacher',
    available: true,
    description: 'Identidad docente y número de empleado.',
  },
] as const;

export function resolveStudentDestination(hashRaw: string): { section: StudentNavSection; academicView?: StudentAcademicView } {
  const hash = hashRaw.replace(/^#/, '').trim().toLowerCase();
  const found = STUDENT_NAV_ITEMS.find(item => item.hash === hash || item.id === hash);
  if (found) {
    return {
      section: found.section as StudentNavSection,
      academicView: found.subView as StudentAcademicView | undefined,
    };
  }
  return { section: 'home' };
}

export function resolveTeacherDestination(hashRaw: string): TeacherNavSection {
  const hash = hashRaw.replace(/^#/, '').trim().toLowerCase();
  const found = TEACHER_NAV_ITEMS.find(item => item.hash === hash || item.id === hash);
  if (found) {
    return found.section as TeacherNavSection;
  }
  return 'home';
}

export function getPersonalNavHref(base: string, item: PersonalNavDestination): Route {
  return `${base}#${item.hash}` as Route;
}
