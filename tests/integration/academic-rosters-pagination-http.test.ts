import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {academicRostersFixture} from '../support/academic-rosters-fixture';
import {fixtureMfaLogin} from '../support/mfa-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
let fixture:Awaited<ReturnType<typeof academicRostersFixture>>,cookie='';
type Resource='enrollments'|'assignments';
async function request(resource:Resource,query='',tenant=fixture.tenant,authorization=cookie){return fetch(`${base}/api/v1/institutions/${tenant}/${resource}${query?'?'+query:''}`,{headers:{cookie:authorization}})}
describe.sequential('academic rosters cursor contract through real HTTP',()=>{
 beforeAll(async()=>{
  await sql.connect();fixture=await academicRostersFixture(sql);
  const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({username:fixture.username,password:fixture.password})});
  expect(login.status).toBe(200);cookie=await fixtureMfaLogin(sql,base,fixture.username,fixture.password,login);
 },30000);
 afterAll(async()=>{await sql.end()});
 describe.each(['enrollments','assignments'] as const)('%s',resource=>{
  it('retrieves all rows beyond 200 in exact order without duplicates',async()=>{
   const table=resource==='enrollments'?'section_enrollments':'section_teachers',active=resource==='assignments'?' AND revoked_at IS NULL':'';
   const expected=(await sql.query(`SELECT id FROM ${table} WHERE institution_id=$1${active} ORDER BY created_at DESC,id DESC`,[fixture.tenant])).rows.map(row=>row.id);
   const ids:string[]=[],seen=new Set<string>();let cursor:string|null=null,withdrawn=false;
   do{
    const response=await request(resource,'limit=37'+(cursor?'&cursor='+encodeURIComponent(cursor):''));expect(response.status).toBe(200);
    const body=await response.json();expect(body).toHaveProperty('page.nextCursor');expect(body.data.length).toBeLessThanOrEqual(37);
    expect(body.data.every((row:{institutionId:string;cursorAt?:string;revokedAt?:string|null})=>row.institutionId===fixture.tenant&&row.cursorAt===undefined&&(resource!=='assignments'||row.revokedAt===null))).toBe(true);
    withdrawn ||=body.data.some((row:{status?:string})=>row.status==='withdrawn');
    ids.push(...body.data.map((row:{id:string})=>row.id));cursor=body.page.nextCursor;
    if(cursor){expect(seen.has(cursor)).toBe(false);seen.add(cursor)}
   }while(cursor);
   expect(ids).toEqual(expected);expect(ids).toHaveLength(208);expect(new Set(ids).size).toBe(208);
   if(resource==='enrollments')expect(withdrawn).toBe(true);
  });
  it('binds cursors to tenant, resource and section filter',async()=>{
   const main=fixture.sections[fixture.tenant].main,alternate=fixture.sections[fixture.tenant].alternate;
   const first=await request(resource,'limit=1&sectionId='+main),cursor=(await first.json()).page.nextCursor;expect(cursor).toBeTypeOf('string');
   for(const query of ['cursor='+cursor,'sectionId='+alternate+'&cursor='+cursor])expect((await request(resource,query)).status).toBe(422);
   expect((await request(resource,'sectionId='+main+'&cursor='+cursor,fixture.other)).status).toBe(422);
   expect((await request(resource==='enrollments'?'assignments':'enrollments','sectionId='+main+'&cursor='+cursor)).status).toBe(422);
   const filtered=await request(resource,'sectionId='+alternate);expect(filtered.status).toBe(200);const body=await filtered.json();expect(body.data).toHaveLength(3);expect(body.page.nextCursor).toBeNull();expect(body.data.every((row:{sectionId:string})=>row.sectionId===alternate)).toBe(true);
   const other=await request(resource,'',fixture.other);expect(other.status).toBe(200);expect((await other.json()).data.every((row:{institutionId:string})=>row.institutionId===fixture.other)).toBe(true);
  });
  it.each(['limit=0','limit=101','limit=1&limit=2','cursor=invalid','unknown=1','sectionId=bad','sectionId=','sectionId=00000000-0000-4000-8000-000000000001&sectionId=00000000-0000-4000-8000-000000000002'])('rejects invalid query %s',async query=>{expect((await request(resource,query)).status).toBe(422)});
  it('denies unauthenticated access without data or cursor',async()=>{const response=await request(resource,'limit=1',fixture.tenant,'');expect(response.status).toBe(403);expect(await response.json()).not.toHaveProperty('data')});
 });
 it('revalidates authority between pages',async()=>{
  const first=await request('enrollments','limit=1'),cursor=(await first.json()).page.nextCursor;
  await sql.query("UPDATE institution_memberships SET status='suspended' WHERE institution_id=$1 AND user_id=$2",[fixture.tenant,fixture.user]);
  for(const resource of ['enrollments','assignments'] as const){const response=await request(resource,'cursor='+cursor);expect(response.status).toBe(403);expect(await response.json()).not.toHaveProperty('data')}
 });
});
