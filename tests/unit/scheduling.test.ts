import { describe,expect,it } from 'vitest';
import { roomCreate,patternCreate,occurrenceDates,intervalOverlaps,occurrenceUpdate } from '@/modules/scheduling/validation';
const id='a84b0d45-a3a0-4fe3-ab73-71ed9779848d';
describe('R4 scheduling and stable occurrences',()=>{
 it('creates deterministic Monday and Saturday dates including school Saturday',()=>{
  expect(occurrenceDates('2026-10-12','2026-10-19',1)).toEqual(['2026-10-12','2026-10-19']);
  expect(occurrenceDates('2026-10-12','2026-10-19',6)).toEqual(['2026-10-17']);
 });
 it('rejects invalid intervals and allows a 7am Saturday block',()=>{
  expect(patternCreate.safeParse({sectionId:id,roomId:id,weekday:6,startMinute:420,endMinute:540}).success).toBe(true);
  expect(patternCreate.safeParse({sectionId:id,roomId:id,weekday:4,startMinute:780,endMinute:780}).success).toBe(false);
  expect(patternCreate.safeParse({sectionId:id,roomId:id,weekday:8,startMinute:420,endMinute:540}).success).toBe(false);
 });
 it('detects overlap but permits adjacent blocks',()=>{
  expect(intervalOverlaps({startMinute:420,endMinute:540},{startMinute:500,endMinute:600})).toBe(true);
  expect(intervalOverlaps({startMinute:420,endMinute:540},{startMinute:540,endMinute:660})).toBe(false);
 });
 it('rejects school terms longer than allowed and invalid weekdays',()=>{
  expect(()=>occurrenceDates('2026-01-01','2028-01-01',1)).toThrow('INVALID_TERM_RANGE');
  expect(()=>occurrenceDates('2026-10-12','2026-10-18',0)).toThrow('INVALID_TERM');
 });
 it('validates rooms and requires a reason for cancelling',()=>{
  expect(roomCreate.safeParse({campusId:id,code:'A101',building:'Edificio A',capacity:30}).success).toBe(true);
  expect(roomCreate.safeParse({campusId:id,code:'A101',building:'Edificio A',capacity:0}).success).toBe(false);
  expect(occurrenceUpdate.safeParse({id,state:'CANCELLED',reason:'Docente ausente'}).success).toBe(true);
  expect(occurrenceUpdate.safeParse({id,state:'RESCHEDULED',reason:'Cambio'}).success).toBe(false);
 });
});
