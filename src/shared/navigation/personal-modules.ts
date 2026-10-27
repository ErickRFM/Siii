/** Presentation projection; each portal independently checks its current link and authority. */
export function hasOnlyPersonalRoles(roles:readonly string[]){return roles.some(role=>role==='student'||role==='teacher')&&roles.every(role=>['student','teacher','teacher_pending','workshop_participant','guest'].includes(role))}
export function personalModuleLinks(capabilities:readonly string[],roles:readonly string[],scoped:readonly {capabilities:readonly string[]}[]=[]){
 const has=(capability:string)=>capabilities.includes(capability)||scoped.some(scope=>scope.capabilities.includes(capability));
 return [
  ...(roles.includes('student')&&has('student.self.read')?[{id:'student',label:'Mi vida universitaria',icon:'book' as const,description:'Expediente, inscripciones, calificaciones, servicios y estado de cuenta.'}]:[]),
  ...(roles.includes('teacher')&&has('teacher.self.read')?[{id:'teacher',label:'Mi docencia',icon:'grades' as const,description:'Grupos asignados, listas oficiales, horarios y evaluación.'}]:[]),
  ...(capabilities.includes('institutions.manage')?[{id:'financials',label:'Caja y finanzas',icon:'services' as const,description:'Conceptos, órdenes y registro de pagos externos.'}]:[]),
 ];
}
