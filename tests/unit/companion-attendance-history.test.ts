import {createHash,createHmac,randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readCompanionAttendance} from '@/integrations/companion/attendance-history';

const institution=randomUUID(),sectionId=randomUUID(),occurrenceId=randomUUID(),sessionId=randomUUID(),secret=Buffer.alloc(32,9);
const targets=JSON.stringify({[institution]:{origin:'https://companion.fixture.example',keyId:'attendance-reader',secretBase64:secret.toString('base64')}});
const value=()=>({contract:'siii.attendance_history.v1',observedAtEpochSeconds:Math.floor(Date.now()/1000),sampleLimit:100,records:[{
 auditRecordId:'a'.repeat(64),sessionId,sectionId,occurrenceId,sourceVersion:2,occurrenceDate:'2026-10-28',status:'review_required',disposition:null,
 reasonCode:'class_call_confirmed',receivedAtEpochSeconds:1,
}]});
afterEach(()=>vi.unstubAllEnvs());

describe('private bounded Companion attendance reader',()=>{
 it('signs exact reader purpose and preserves review-required decisions without private identifiers',async()=>{
  const http=vi.fn<typeof fetch>(async(url,init)=>{
   expect(String(url)).toBe('https://companion.fixture.example/integration/v1/attendance-history');
   expect(init).toMatchObject({method:'POST',redirect:'manual',credentials:'omit',cache:'no-store'});
   expect(JSON.parse(String(init?.body))).toEqual({contract:'siii.attendance_history_request.v1',studentExternalId:'MAT-001'});
   const headers=new Headers(init?.headers),canonical=['POST','/integration/v1/attendance-history',headers.get('x-integration-timestamp'),headers.get('x-integration-nonce'),createHash('sha256').update(String(init?.body)).digest('hex')].join('\n');
   expect(headers.get('x-integration-key-id')).toBe('attendance-reader');
   expect(headers.get('x-integration-signature')).toBe('v1='+createHmac('sha256',secret).update(canonical).digest('hex'));
   return Response.json(value());
  });
  const result=await readCompanionAttendance(institution,'MAT-001',{targets,http});
  expect(result).toMatchObject({contract:'siii.attendance_history.v1',records:[{status:'review_required',reviewedAtEpochSeconds:null}]});
  expect(http).toHaveBeenCalledTimes(1);
 });
 it('never falls back to the academic delivery credential',async()=>{
  vi.stubEnv('SIII_COMPANION_DELIVERY_TARGETS_JSON',targets);vi.stubEnv('SIII_COMPANION_ATTENDANCE_TARGETS_JSON','');
  const http=vi.fn<typeof fetch>();
  expect(await readCompanionAttendance(institution,'MAT-001',{http})).toBeNull();expect(http).not.toHaveBeenCalled();
 });
 it.each(['http','loopback','private-ip','credentials','path','foreign-tenant'] as const)('rejects unsafe or unbound destination %s without sending',async mode=>{
  const origins={http:'http://example.test',loopback:'https://localhost.local', 'private-ip':'https://127.0.0.1',credentials:'https://user:password@example.test',path:'https://example.test/untrusted','foreign-tenant':'https://example.test'};
  const encoded=JSON.stringify({[mode==='foreign-tenant'?randomUUID():institution]:{origin:origins[mode],keyId:'reader',secretBase64:secret.toString('base64')}});
  const http=vi.fn<typeof fetch>();expect(await readCompanionAttendance(institution,'MAT-001',{targets:encoded,http})).toBeNull();expect(http).not.toHaveBeenCalled();
 });
 it.each(['unknown-field','private-record-field','invalid-status','duplicate','stale','redirect','unauthorized','oversized','malformed','outage'] as const)('fails closed for %s',async mode=>{
  const body=value();
  if(mode==='invalid-status')body.records[0].status='physically_verified';
  if(mode==='duplicate')body.records.push(body.records[0]);
  if(mode==='stale')body.observedAtEpochSeconds-=120;
  const http=vi.fn<typeof fetch>(async()=>{
   if(mode==='outage')throw Error('private remote diagnostic');
   if(mode==='redirect')return new Response(null,{status:302,headers:{location:'https://foreign.invalid'}});
   if(mode==='unauthorized')return new Response('private auth error',{status:403});
   if(mode==='oversized')return new Response(' '.repeat(131073));
   if(mode==='malformed')return new Response('not-json');
   return Response.json(mode==='unknown-field'?{...body,secret:'private'}:mode==='private-record-field'?{...body,records:[{...body.records[0],nativeStudentId:'private'}]}:body);
  });
  expect(await readCompanionAttendance(institution,'MAT-001',{targets,http})).toBeNull();expect(http).toHaveBeenCalledTimes(1);
 });
 it('uses a new nonce for each independent read',async()=>{
  const nonces:string[]=[];
  const http=vi.fn<typeof fetch>(async(_url,init)=>{nonces.push(new Headers(init?.headers).get('x-integration-nonce')!);return Response.json({...value(),records:[]});});
  await readCompanionAttendance(institution,'MAT-001',{targets,http});await readCompanionAttendance(institution,'MAT-001',{targets,http});
  expect(new Set(nonces).size).toBe(2);
 });
 it('negotiates v2 without weakening v1 and requires a positive record revision',async()=>{
  const body={...value(),contract:'siii.attendance_history.v2',page:1,records:value().records.map(row=>({...row,recordRevision:2}))};
  const http=vi.fn<typeof fetch>(async(_url,init)=>{expect(JSON.parse(String(init?.body)).contract).toBe('siii.attendance_history_request.v2');return Response.json(body)});
  expect(await readCompanionAttendance(institution,'MAT-001',{targets,http,version:2})).toMatchObject({contract:'siii.attendance_history.v2',records:[{recordRevision:2}]});
  body.records[0].recordRevision=0;expect(await readCompanionAttendance(institution,'MAT-001',{targets,http,version:2})).toBeNull();
  const unversioned=vi.fn<typeof fetch>(async()=>Response.json(value()));expect(await readCompanionAttendance(institution,'MAT-001',{targets,http:unversioned,version:2})).toBeNull();
 });

 it('uses a separate archive credential and rejects cross-purpose responses or pages',async()=>{
  vi.stubEnv('SIII_COMPANION_ATTENDANCE_TARGETS_JSON',targets);vi.stubEnv('SIII_COMPANION_RESULTS_TARGETS_JSON','');
  const http=vi.fn<typeof fetch>(async()=>Response.json({...value(),contract:'siii.attendance_archive.v1',page:1,records:value().records.map(row=>({...row,recordRevision:1}))}));
  expect(await readCompanionAttendance(institution,'MAT-001',{http,version:'archive'})).toBeNull();expect(http).not.toHaveBeenCalled();
  vi.stubEnv('SIII_COMPANION_RESULTS_TARGETS_JSON',targets);
  expect(await readCompanionAttendance(institution,'MAT-001',{http,version:'archive'})).toMatchObject({contract:'siii.attendance_archive.v1'});
  expect(await readCompanionAttendance(institution,'MAT-001',{http,version:'archive',page:2})).toBeNull();
 });

 it('exports teacher class closures with no student records using only the archive purpose',async()=>{
  const body={...value(),contract:'siii.attendance_archive.v1',page:1,records:[],classSessions:[{sessionId,sectionId,occurrenceId,sourceVersion:2,occurrenceDate:'2026-10-28',teacherExternalId:'EMP001',sessionRevision:2,status:'closed',openedAtEpochSeconds:1,closedAtEpochSeconds:2,closedByTeacher:true}]};
  const http=vi.fn<typeof fetch>(async(_url,init)=>{expect(JSON.parse(String(init?.body))).toEqual({contract:'siii.attendance_archive_request.v1',teacherExternalId:'EMP001',page:1});return Response.json(body)});
  expect(await readCompanionAttendance(institution,'EMP001',{targets,http,version:'archive',subjectType:'teacher'})).toMatchObject({classSessions:[{closedByTeacher:true}]});
  body.classSessions[0].closedAtEpochSeconds=0;expect(await readCompanionAttendance(institution,'EMP001',{targets,http,version:'archive',subjectType:'teacher'})).toBeNull();
 });

});
