import type {CompanionAttendanceHistory} from './attendance-history';

/** Labels come only from the currently authorized SIII source; attendance remains in Ktor. */
export type AttendanceSectionDetails={
 sectionId:string;sourceVersion:number;groupName:string;subjectId:string;subjectName:string;
 termId:string;termName:string;teacherNames:string[];
};
export type PersonalAttendanceHistory=CompanionAttendanceHistory&{sections?:AttendanceSectionDetails[]};
export function attendanceRows(history:PersonalAttendanceHistory){
 return history.records.map(record=>{
  const section=history.sections?.find(section=>section.sectionId===record.sectionId&&section.sourceVersion===record.sourceVersion);
  return {...record,id:record.auditRecordId,groupName:section?.groupName??record.sectionId,subjectId:section?.subjectId??'',subjectName:section?.subjectName??'Materia no disponible',termId:section?.termId??'',termName:section?.termName??'Periodo no disponible',teacherNames:section?.teacherNames.join(', ')||'Docente no disponible'};
 });
}
