import { describe,it,expect } from 'vitest';
import { nextRequestStatus,noticeCreate,noticeStatus,requestCreate,workshopCreate,workshopEnroll,tutorCreate } from '@/modules/services/validation';
const id='a84b0d45-a3a0-4fe3-ab73-71ed9779848d';
describe('R5 academic services validation',()=>{
 it('restricts student request lifecycle to permitted transitions',()=>{
  expect(nextRequestStatus('SUBMITTED','IN_REVIEW')).toBe(true);
  expect(nextRequestStatus('IN_REVIEW','APPROVED')).toBe(true);
  expect(nextRequestStatus('APPROVED','CLOSED')).toBe(true);
  expect(nextRequestStatus('REJECTED','APPROVED')).toBe(false);
  expect(nextRequestStatus('CLOSED','IN_REVIEW')).toBe(false);
 });
 it('rejects contentless notices and unknown visibility bypasses',()=>{
  expect(noticeCreate.safeParse({title:'Aviso',body:'Contenido de aviso importante'}).success).toBe(true);
  expect(noticeCreate.safeParse({title:'A',body:'Corto'}).success).toBe(false);
  expect(noticeStatus.safeParse({id,status:'ADMIN_ONLY'}).success).toBe(false);
 });
 it('requires valid student records and meaningful request explanations',()=>{
  expect(requestCreate.safeParse({studentId:id,requestType:'CERTIFICATE',summary:'Solicitud de constancia actualizada'}).success).toBe(true);
  expect(requestCreate.safeParse({studentId:'otra',requestType:'CERTIFICATE',summary:'Hola'}).success).toBe(false);
 });
 it('requires valid, forward-running workshops and bounded capacity',()=>{
  const data={title:'Taller de programación',description:'Clases prácticas de programación móvil',teacherId:id,
   startsAt:'2026-11-10T07:00:00-06:00',endsAt:'2026-11-10T09:00:00-06:00',capacity:30};
  expect(workshopCreate.safeParse(data).success).toBe(true);
  expect(workshopCreate.safeParse({...data,capacity:0}).success).toBe(false);
  expect(workshopCreate.safeParse({...data,endsAt:'2026-11-10T06:00:00-06:00'}).success).toBe(false);
  expect(workshopEnroll.safeParse({workshopId:id,studentId:id}).success).toBe(true);
 });
 it('does not accept tutor case data with cross-resource forged identifiers',()=>{
  expect(tutorCreate.safeParse({teacherId:id,studentId:id,subject:'Seguimiento semestral'}).success).toBe(true);
  expect(tutorCreate.safeParse({teacherId:id,studentId:'any',subject:'Seguimiento semestral'}).success).toBe(false);
 });
});
