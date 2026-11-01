import {describe,expect,it} from 'vitest';
import {attendanceRows,type PersonalAttendanceHistory} from '@/integrations/companion/attendance-view';
const section={sectionId:'section',sourceVersion:1,groupName:'9A',subjectId:'subject',subjectName:'Programación',termId:'term',termName:'2026-3',teacherNames:['Docente autorizado']};
const record={auditRecordId:'a'.repeat(64),sessionId:'session',sectionId:'section',occurrenceId:'occurrence',sourceVersion:1,occurrenceDate:'2026-10-31',status:'review_required' as const,disposition:'absent' as const,reasonCode:'teacher_review' as const,receivedAtEpochSeconds:1,reviewedAtEpochSeconds:1};
function history(sections?:PersonalAttendanceHistory['sections']):PersonalAttendanceHistory{return {contract:'siii.attendance_history.v1',observedAtEpochSeconds:1,sampleLimit:100,records:[record],sections};}
describe('authorized attendance labels',()=>{
 it('adds current institutional labels without changing the persisted attendance decision',()=>{
  const row=attendanceRows(history([section]))[0];
  expect(row).toMatchObject({subjectName:'Programación',groupName:'9A',teacherNames:'Docente autorizado',termName:'2026-3',disposition:'absent',status:'review_required'});
  expect(row.id).toBe(record.auditRecordId);expect(record).not.toHaveProperty('subjectName');
 });
 it('never labels an attendance record with another section or stale revision',()=>{
  for(const candidate of [{...section,sectionId:'foreign'},{...section,sourceVersion:2}]){
   const row=attendanceRows(history([candidate]))[0];expect(row.subjectId).toBe('');expect(row.teacherNames).toBe('Docente no disponible');expect(row.groupName).toBe(record.sectionId);
  }
 });
 it('supports receivers without labels and leaves unknown periods outside named filters',()=>{
  const row=attendanceRows(history())[0];expect(row.termId).toBe('');expect(row.subjectName).toBe('Materia no disponible');
 });
});
