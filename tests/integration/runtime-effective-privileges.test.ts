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

it('rejects a SET-only secondary role that can truncate audit',async()=>{
 const raw=isolatedDatabaseUrl(),owner=new pg.Client({connectionString:raw});await owner.connect();
 const suffix=randomBytes(6).toString('hex'),role='p0_1_switch_'+suffix,parent='p0_1_trunc_'+suffix,secret=randomBytes(32).toString('hex');
 await owner.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '+pg.escapeLiteral(secret));
 await owner.query('CREATE ROLE '+parent+' NOLOGIN');
 await owner.query('GRANT siii_app TO '+role);
 await owner.query('GRANT USAGE ON SCHEMA public TO '+parent);
 await owner.query('GRANT TRUNCATE ON security_audit_log TO '+parent);
 await owner.query('GRANT '+parent+' TO '+role+' WITH INHERIT FALSE, SET TRUE');
 const app=new URL(raw);app.username=role;app.password=secret;
 const original=process.env.DATABASE_URL;process.env.DATABASE_URL=app.toString();vi.resetModules();
 let module:typeof import('@/infrastructure/database')|undefined;
 try{
  const {GET}=await import('@/app/api/ready/route');module=await import('@/infrastructure/database');
  const result=await GET();expect(result.status).toBe(503);expect(await result.json()).toHaveProperty('error.code','DATABASE_ROLE_UNSAFE');
 }finally{
  await module?.pool.end();process.env.DATABASE_URL=original;vi.resetModules();
  await owner.query('DROP OWNED BY '+role);await owner.query('DROP ROLE '+role);await owner.query('DROP ROLE '+parent);await owner.end();
 }
});

it('rejects ADMIN-only membership that can make a dangerous role usable',async()=>{
 const raw=isolatedDatabaseUrl(),owner=new pg.Client({connectionString:raw});await owner.connect();
 const suffix=randomBytes(6).toString('hex'),role='p0_1_admin_'+suffix,parent='p0_1_managed_'+suffix,secret=randomBytes(32).toString('hex');
 await owner.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '+pg.escapeLiteral(secret));
 await owner.query('CREATE ROLE '+parent+' NOLOGIN');await owner.query('GRANT siii_app TO '+role);
 await owner.query('GRANT USAGE ON SCHEMA public TO '+parent);
 await owner.query('GRANT TRUNCATE ON security_audit_log TO '+parent);
 await owner.query('GRANT '+parent+' TO '+role+' WITH ADMIN TRUE, INHERIT FALSE, SET FALSE');
 const appUrl=new URL(raw);appUrl.username=role;appUrl.password=secret;
 const direct=new pg.Client({connectionString:appUrl.toString()});await direct.connect();
 const original=process.env.DATABASE_URL;process.env.DATABASE_URL=appUrl.toString();vi.resetModules();
 let module:typeof import('@/infrastructure/database')|undefined;
 try{
  const {GET}=await import('@/app/api/ready/route');module=await import('@/infrastructure/database');
  const result=await GET();
  // An ordinary LOGIN with ADMIN OPTION can enable SET for its own membership.
  await direct.query('GRANT '+parent+' TO '+role+' WITH SET TRUE');
  await direct.query('SET ROLE '+parent);
  expect((await direct.query("SELECT has_table_privilege(current_user,'public.security_audit_log','TRUNCATE') AS dangerous")).rows[0].dangerous).toBe(true);
  await direct.query('RESET ROLE');expect(result.status).toBe(503);
 }finally{
  await direct.end();await module?.pool.end();process.env.DATABASE_URL=original;vi.resetModules();
  await owner.query('DROP OWNED BY '+parent);await owner.query('DROP ROLE '+role);await owner.query('DROP ROLE '+parent);await owner.end();
 }
});

it.each(['pg_read_server_files','pg_write_server_files','pg_execute_server_program'])('rejects predefined server access membership: %s',async parent=>{
 const raw=isolatedDatabaseUrl(),owner=new pg.Client({connectionString:raw});await owner.connect();
 const role='p0_1_system_'+randomBytes(6).toString('hex'),secret=randomBytes(32).toString('hex');
 await owner.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '+pg.escapeLiteral(secret));
 await owner.query('GRANT siii_app,'+parent+' TO '+role);
 const app=new URL(raw);app.username=role;app.password=secret;
 const original=process.env.DATABASE_URL;process.env.DATABASE_URL=app.toString();vi.resetModules();
 let module:typeof import('@/infrastructure/database')|undefined;
 try{
  const attrs=(await owner.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',[parent])).rows[0];
  expect(Object.values(attrs).every(value=>value===false)).toBe(true);
  const {GET}=await import('@/app/api/ready/route');module=await import('@/infrastructure/database');
  expect((await GET()).status).toBe(503); // No file read/write or server program is executed.
 }finally{
  await module?.pool.end();process.env.DATABASE_URL=original;vi.resetModules();
  await owner.query('DROP ROLE '+role);await owner.end();
 }
});
