import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AcademicWeek,weekDates,academicClock,type AcademicOccurrence} from '../../src/components/academic-week';

describe('academic weekly presentation',()=>{
 it('normalizes a Sunday across the year boundary without local-time drift',()=>{
  expect(weekDates('2027-01-03')).toEqual(['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  expect(weekDates('')).toEqual([]);
  expect(academicClock(5)).toBe('00:05');expect(academicClock(1440)).toBe('24:00');
 });
 it('preserves concurrent classes, cancellation reasons and actionable session names',()=>{
  const base:AcademicOccurrence={id:'first',date:'2026-10-26',state:'SCHEDULED',sectionCode:'A1',courseName:'Álgebra',roomBuilding:'Principal',roomCode:'101',startMinute:420,endMinute:480};
  const html=renderToStaticMarkup(<AcademicWeek week="2026-10-26" occurrences={[base,{...base,id:'second',sectionCode:'B2',state:'CANCELLED',reason:'Aula en mantenimiento'}]} busy={false} onCancel={()=>{}}/>);
  expect(html).toContain('A1');expect(html).toContain('B2');expect(html).toContain('Aula en mantenimiento');
  expect(html.match(/Cancelar clase/g)).toHaveLength(1);
  expect(html).toContain('Cancelar A1 el 2026-10-26 a las 07:00');
 });
});
