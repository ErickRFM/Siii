import {describe,it,beforeAll,afterAll,expect} from 'vitest';
import pg from 'pg';
import argon2 from 'argon2';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {isolatedDatabaseUrl} from '../support/database-url';
const raw=isolatedDatabaseUrl(),sql=new pg.Client({connectionString:raw}),base='http://127.0.0.1:3107';
const username='p01-race-'+randomUUID().slice(0,8),password='Synthetic-race-password-2026!',key=createHash('sha256').update('login_account\0'+username).digest('hex');

describe.sequential('authentication cleanup concurrency',()=>{
 beforeAll(async()=>{
  await sql.connect();const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Cleanup') RETURNING id")).rows[0].id;
  await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1})]);
  await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'});
 },30000);
 it('acquires an account bucket atomically if concurrent cleanup deletes its old row',async()=>{
  await sql.query('DELETE FROM auth_throttle');
  await sql.query("INSERT INTO auth_throttle(key,scope,window_started_at,expires_at) VALUES($1,'login_account',now(),now()-interval '1 second')",[key]);
  const gate=new pg.Client({connectionString:raw});await gate.connect();await gate.query('BEGIN');let pending:Promise<Response>|undefined;
  try{
   await gate.query('SELECT key FROM auth_throttle WHERE key=$1 FOR UPDATE',[key]);
   pending=fetch(base+'/api/v1/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({username,password})});
   let blocked=false;for(let i=0;i<80;i++){blocked=(await sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%auth_throttle%'")).rows[0].n>0;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,50));}
   expect(blocked).toBe(true);await gate.query('DELETE FROM auth_throttle WHERE key=$1',[key]);await gate.query('COMMIT');
   expect((await pending).status).toBe(200);
   expect((await sql.query("SELECT expires_at>now()+interval '50 minutes' AS fresh FROM auth_throttle WHERE key=$1",[key])).rows[0].fresh).toBe(true);
  }finally{await gate.query('ROLLBACK').catch(()=>undefined);await gate.end();if(pending)await pending;}
 });
 it('cleanup skips a locked expired bucket instead of blocking session operations',async()=>{
  await sql.query('DELETE FROM auth_throttle');
  await sql.query("INSERT INTO auth_throttle(key,scope,expires_at) VALUES($1,'login_account',now()-interval '1 second')",[key]);
  const gate=new pg.Client({connectionString:raw});await gate.connect();await gate.query('BEGIN');
  const connectionString=JSON.parse(readFileSync('.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json','utf8')).connectionString;
  let child:ReturnType<typeof spawn>|undefined;let completed:Promise<number|null>|undefined;
  try{
   await gate.query('SELECT key FROM auth_throttle WHERE key=$1 FOR UPDATE',[key]);
   child=spawn(process.execPath,['--import','tsx','worker/index.ts','--once'],{env:{...process.env,DATABASE_URL:connectionString},stdio:'ignore',windowsHide:true});
   completed=new Promise(resolve=>child!.once('exit',resolve));
   expect(await Promise.race([completed,new Promise(resolve=>setTimeout(()=>resolve('blocked'),2500))])).toBe(0);
   expect((await sql.query('SELECT count(*)::int AS n FROM auth_throttle WHERE key=$1',[key])).rows[0].n).toBe(1);
  }finally{await gate.query('ROLLBACK');await gate.end();if(completed)await completed;}
 });
 afterAll(async()=>sql.end());
});

