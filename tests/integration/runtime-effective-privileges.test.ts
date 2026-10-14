import {it,expect,vi} from 'vitest';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
it.each(['DELETE','TRUNCATE','UPDATE_COLUMN'])('refuses a runtime LOGIN with inherited or direct audit %s',async privilege=>{
 const raw=isolatedDatabaseUrl(),owner=new pg.Client({connectionString:raw});await owner.connect();
 const role='p0_1_dirty_'+randomBytes(6).toString('hex'),secret=randomBytes(32).toString('hex');
 await owner.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '+pg.escapeLiteral(secret));
 await owner.query('GRANT siii_app TO '+role);
 await owner.query('GRANT '+(privilege==='UPDATE_COLUMN'?'UPDATE(action)':privilege)+' ON security_audit_log TO '+role);
 const app=new URL(raw);app.username=role;app.password=secret;
 const original=process.env.DATABASE_URL;process.env.DATABASE_URL=app.toString();vi.resetModules();
 let module:typeof import('@/infrastructure/database')|undefined;
 try{
  const {GET}=await import('@/app/api/ready/route');module=await import('@/infrastructure/database');
  const result=await GET();expect(result.status).toBe(503);expect(await result.json()).toHaveProperty('error.code','DATABASE_ROLE_UNSAFE');
 }finally{
  await module?.pool.end();process.env.DATABASE_URL=original;vi.resetModules();
  await owner.query('DROP OWNED BY '+role);await owner.query('DROP ROLE '+role);await owner.end();
 }
});
it.each(['CREATEROLE_PARENT','NOINHERIT_APP'])('refuses runtime privilege escalation or ineffective membership: %s',async scenario=>{
 const raw=isolatedDatabaseUrl(),owner=new pg.Client({connectionString:raw});await owner.connect();
 const suffix=randomBytes(6).toString('hex'),role='p0_1_login_'+suffix,parent='p0_1_parent_'+suffix,secret=randomBytes(32).toString('hex');
 await owner.query('CREATE ROLE '+role+' LOGIN '+(scenario==='NOINHERIT_APP'?'NOINHERIT':'INHERIT')+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '+pg.escapeLiteral(secret));
 await owner.query('GRANT siii_app TO '+role);
 if(scenario==='CREATEROLE_PARENT'){
  await owner.query('CREATE ROLE '+parent+' NOLOGIN CREATEROLE');
  await owner.query('GRANT '+parent+' TO '+role);
 }
 const app=new URL(raw);app.username=role;app.password=secret;
 const original=process.env.DATABASE_URL;process.env.DATABASE_URL=app.toString();vi.resetModules();
 let module:typeof import('@/infrastructure/database')|undefined;
 try{
  const {GET}=await import('@/app/api/ready/route');module=await import('@/infrastructure/database');
  const result=await GET();expect(result.status).toBe(503);expect(await result.json()).toHaveProperty('error.code','DATABASE_ROLE_UNSAFE');
 }finally{
  await module?.pool.end();process.env.DATABASE_URL=original;vi.resetModules();
  await owner.query('DROP OWNED BY '+role);await owner.query('DROP ROLE '+role);
  if(scenario==='CREATEROLE_PARENT')await owner.query('DROP ROLE '+parent);
  await owner.end();
 }
});
