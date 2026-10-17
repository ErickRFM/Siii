const MANAGEMENT=['programs','curricula','courses','campuses','terms'].map(resource=>resource+'.manage');
const MODULES=[{id:'registry',label:'Estudiantes y docentes',glyph:'▣'},{id:'operations',label:'Grupos e inscripciones',glyph:'▤'},{id:'grading',label:'Calificaciones',glyph:'▦'},{id:'scheduling',label:'Horarios y aulas',glyph:'◷'},{id:'services',label:'Servicios universitarios',glyph:'✉'}] as const;
export const allAcademicModuleLinks = MODULES;
export type AcademicModule=typeof MODULES[number]['id'];
/** Presentation projection only. Each page and API independently checks current permissions. */
export function academicModuleLinks(capabilities:readonly string[]){const manage=MANAGEMENT.every(capability=>capabilities.includes(capability));return MODULES.filter(module=>module.id==='grading'?capabilities.includes('grades.manage'):manage)}
