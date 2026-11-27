import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';

const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
let tenant:string;

async function member(role:string,{expired=false,revoked=false,mfa=false}={}){
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Teacher link') RETURNING id")).rows[0].id;
 const user=(await sql.query("INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,'unused') RETURNING id",[person,'tl-'+randomUUID()])).rows[0].id;
 const membership=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5)",
  [tenant,membership,role,expired?new Date(Date.now()-60000):null,revoked?new Date():null]);
 let cookie='';
 if(mfa){
  await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)]);
  const raw=randomBytes(32).toString('base64url');
  await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at,step_up_at) VALUES($1,$2,now()+interval '1 hour',now(),now())",[user,createHash('sha256').update(raw).digest('hex')]);
  cookie=(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw;
 }
 return {membership,cookie};
}
async function teacher(){return (await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name,status) VALUES($1,$2,'Synthetic','Record','active') RETURNING id",[tenant,'TL-'+randomUUID().slice(0,8)])).rows[0].id as string;}
const send=(method:string,cookie:string,body:unknown)=>fetch(base+'/api/v1/institutions/'+tenant+'/teacher-links',{method,headers:{origin:base,cookie,'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual'});

describe('teacher account links',()=>{
 beforeAll(async()=>{await sql.connect();tenant=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic teacher links',$1) RETURNING id",['TL-'+randomUUID()])).rows[0].id;});
 afterAll(async()=>{await sql.end();});

 it('refuses an expired or revoked teacher grant and links only a live one (B1)',async()=>{
  const admin=await member('admin',{mfa:true});
  for(const state of [{expired:true},{revoked:true}]){
   const target=await member('teacher',state),response=await send('POST',admin.cookie,{teacherId:await teacher(),membershipId:target.membership});
   expect(response.status,JSON.stringify(state)).toBe(422);expect((await response.json()).error.code).toBe('TEACHER_MEMBERSHIP_NOT_VERIFIED');
  }
  const live=await member('teacher'),record=await teacher();
  const created=await send('POST',admin.cookie,{teacherId:record,membershipId:live.membership});expect(created.status).toBe(201);
  const link=(await created.json()).data;
  expect((await send('POST',admin.cookie,{teacherId:record,membershipId:live.membership})).status).toBe(409);
  const revoked=await send('PATCH',admin.cookie,{id:link.id});expect(revoked.status).toBe(200);
  expect((await sql.query('SELECT revoked_at IS NOT NULL AS revoked FROM teacher_account_links WHERE id=$1',[link.id])).rows[0].revoked).toBe(true);
 });
});
