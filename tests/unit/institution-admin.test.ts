import {describe,it,expect} from 'vitest';
import {auditFilters,projectAudit,settingsBody} from '../../src/shared/institution-admin/policy';
describe('institution administration boundary',()=>{
 it('normalizes UTC audit instants before ordering and cursor scope',()=>{
  expect(auditFilters(new URLSearchParams({from:'2026-10-15T20:00:00Z',to:'2026-10-15T20:00:00.999Z'}))).toEqual({from:'2026-10-15T20:00:00.000Z',to:'2026-10-15T20:00:00.999Z'});
  expect(auditFilters(new URLSearchParams({from:'2026-10-15T20:00:00.999Z',to:'2026-10-15T20:00:00Z'}))).toBeNull();
 });
 it('rejects offset syntax while retaining UTC and IANA zones',()=>{
  for(const timezone of ['+01:00','-05:00','Mars/Olympus'])expect(settingsBody.safeParse({timezone,expectedVersion:0,reason:'Reviewed change'}).success).toBe(false);
  for(const timezone of ['UTC','America/Mexico_City','Etc/GMT+1'])expect(settingsBody.safeParse({timezone,expectedVersion:0,reason:'Reviewed change'}).success).toBe(true);
 });
 it('only projects exact known targets and approved flat metadata',()=>{
  const id='4d0d9643-1bd4-4afb-a062-32d1c96834a4';
  expect(projectAudit({before:{status:'active',passwordHash:'secret',email:'leak@example.test'},after:{status:'suspended',nested:{token:'secret'}},reason:'Reviewed change'},'membership:'+id)).toEqual({target:{kind:'membership',id},reason:'Reviewed change',changes:{before:{status:'active'},after:{status:'suspended'}}});
  expect(projectAudit({},'membership:'+id+':private-data').target).toBeNull();
  expect(projectAudit({},'email:leak@example.test').target).toBeNull();
 });
 it('rejects year zero before passing audit boundaries to PostgreSQL',()=>{
  expect(auditFilters(new URLSearchParams({from:'0000-01-01T00:00:00Z'}))).toBeNull();
  expect(auditFilters(new URLSearchParams({to:'0000-12-31T23:59:59Z'}))).toBeNull();
 });
});