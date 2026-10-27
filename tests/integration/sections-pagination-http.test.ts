import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {fixtureMfaLogin} from '../support/mfa-fixture';
import {sectionsFixture} from '../support/sections-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
let fixture:Awaited<ReturnType<typeof sectionsFixture>>,cookie='';
async function request(tenant:string,query='',authorization=cookie){return fetch(`${base}/api/v1/institutions/${tenant}/sections${query?'?'+query:''}`,{headers:{cookie:authorization}})}
describe.sequential('sections cursor contract through real HTTP',()=>{
 beforeAll(async()=>{
  await sql.connect();fixture=await sectionsFixture(sql,'admin');
  const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({username:fixture.username,password:fixture.password})});
  expect(login.status).toBe(200);cookie=await fixtureMfaLogin(sql,base,fixture.username,fixture.password,login);
 },30000);
 afterAll(async()=>{await sql.end()});
 it('retrieves all 205 sections with precise timestamp ties and no duplicates',async()=>{
  const expected=(await sql.query('SELECT id FROM academic_sections WHERE institution_id=$1 ORDER BY created_at DESC,id DESC',[fixture.tenant])).rows.map(row=>row.id);
  const ids:string[]=[],seen=new Set<string>();let cursor:string|null=null;
  do{
   const response=await request(fixture.tenant,'limit=37'+(cursor?'&cursor='+encodeURIComponent(cursor):''));expect(response.status).toBe(200);
   const body=await response.json();expect(body).toHaveProperty('page.nextCursor');expect(body.data.length).toBeLessThanOrEqual(37);
   expect(body.data.every((row:{institutionId:string;cursorAt?:string})=>row.institutionId===fixture.tenant&&row.cursorAt===undefined)).toBe(true);
   ids.push(...body.data.map((row:{id:string})=>row.id));cursor=body.page.nextCursor;
   if(cursor){expect(seen.has(cursor)).toBe(false);seen.add(cursor)}
  }while(cursor);
  expect(ids).toEqual(expected);expect(ids).toHaveLength(205);expect(new Set(ids).size).toBe(205);
 });
 it('keeps tenant and resource cursor scopes separate after authorization',async()=>{
  const first=await request(fixture.tenant,'limit=1'),cursor=(await first.json()).page.nextCursor;expect(cursor).toBeTypeOf('string');
  expect((await request(fixture.other,'cursor='+encodeURIComponent(cursor))).status).toBe(422);
  const registry=await fetch(`${base}/api/v1/institutions/${fixture.tenant}/registry/students?cursor=${encodeURIComponent(cursor)}`,{headers:{cookie}});expect(registry.status).toBe(422);
  const response=await request(fixture.other);expect(response.status).toBe(200);const body=await response.json();
  expect(body.data).toHaveLength(3);expect(body.data.every((row:{institutionId:string})=>row.institutionId===fixture.other)).toBe(true);expect(body.page.nextCursor).toBeNull();
 });
 it.each(['limit=0','limit=101','limit=1&limit=2','cursor=invalid','unknown=1'])('rejects invalid pagination %s',async query=>{expect((await request(fixture.tenant,query)).status).toBe(422)});
 it('denies unauthenticated access without exposing a cursor',async()=>{
  const response=await request(fixture.tenant,'limit=1','');expect(response.status).toBe(403);expect(await response.json()).not.toHaveProperty('page');
 });
});
