import {ACADEMIC_MANAGE_CAPABILITIES} from '@/shared/auth/capabilities';
// Registry, operations, scheduling and services pages authorize with legacy `academic.manage`.
const MANAGEMENT=ACADEMIC_MANAGE_CAPABILITIES;
const MODULES=[{id:'registry',label:'Estudiantes y docentes',glyph:'▣'},{id:'operations',label:'Grupos e inscripciones',glyph:'▤'},{id:'grading',label:'Calificaciones',glyph:'▦'},{id:'scheduling',label:'Horarios y aulas',glyph:'◷'},{id:'services',label:'Servicios universitarios',glyph:'✉'},{id:'admissions',label:'Admisiones',glyph:'▣'},{id:'careers',label:'Carreras',glyph:'◈'},{id:'financials',label:'Caja y finanzas',glyph:'¤'},{id:'companion',label:'Sincronización Compañero',glyph:'⇄'}] as const;
export const allAcademicModuleLinks = MODULES;
export type AcademicModule=typeof MODULES[number]['id'];
// Each module mirrors the capability its page authorizes with.
const OWN_CAPABILITY:Partial<Record<typeof MODULES[number]['id'],string>>={admissions:'admissions.manage',grading:'grades.manage',careers:'groups.manage',financials:'institutions.manage',companion:'integrations.manage'};
/** Presentation projection only. Each page and API independently checks current permissions. */
export function academicModuleLinks(capabilities:readonly string[]){const manage=MANAGEMENT.every(capability=>capabilities.includes(capability));return MODULES.filter(module=>{const own=OWN_CAPABILITY[module.id];return own?capabilities.includes(own):manage;})}
