import {describe,it,expect} from 'vitest';
import {institutionalStudentSummary} from '@/components/student-dashboard-metrics';
import type {PersonalSnapshot} from '@/components/use-personal-snapshot';
const empty:PersonalSnapshot={profile:null,courses:[],teachers:[],schedule:[],grades:[],orders:[],payments:[],groups:[],announcements:[],requests:[],pendingRequests:[],requestHistory:[]};
const grade=(id:string,scoreHundredths:number,version=1)=>({id,sectionId:id,sectionCode:'A',sectionStatus:'open',courseCode:id,courseName:id,credits:5,termId:'t',termName:'2026-2',termStart:'',termEnd:'',scoreHundredths,version,publishedAt:'2026-10-27'});
const course=(id:string)=>({...grade(id,0),id,sectionId:id});
describe('student dashboard metrics',()=>{
 it('does not turn missing grades into an invented average or completion ratio',()=>{
  const m=institutionalStudentSummary({...empty});
  expect(m.gradeMean).toBeNull();
  expect(m.publicationRatio).toBeNull();
  expect(m.creditsWithPublishedGrade).toBe(0);
 });
 it('deduplicates grade versions and scopes publication progress to enrolled sections',()=>{
  const m=institutionalStudentSummary({...empty,courses:[course('s1'),course('s2')],grades:[grade('s1',650),grade('s1',850,2),grade('other',1000)]});
  expect(m.published).toHaveLength(2);
  expect(m.gradeMean).toBe(9.25);
  expect(m.publicationRatio).toBe(50);
  expect(m.creditsWithPublishedGrade).toBe(10);
 });
 it('does not aggregate incomparable currencies',()=>{
  const m=institutionalStudentSummary({...empty,orders:[{id:'a',orderNumber:'1',feeTypeName:'Fee',totalAmountCents:1000,paidAmountCents:250,currency:'MXN',status:'pending',dueDate:null},{id:'b',orderNumber:'2',feeTypeName:'Fee2',totalAmountCents:500,paidAmountCents:0,currency:'USD',status:'pending',dueDate:null}]});
  expect(m.currency).toBeNull();
  expect(m.outstanding).toBe(1250);
 });
});
