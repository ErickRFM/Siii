import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../../db/schema';
import { logger } from '@/shared/logging';
const configured=Number(process.env.SIII_POOL_MAX ?? 5);
if(!Number.isInteger(configured)||configured<1||configured>20)throw new Error('INVALID_POOL_SIZE');
export const pool=new pg.Pool({
 connectionString:process.env.DATABASE_URL,
 max:configured,
 connectionTimeoutMillis:5000,
 idleTimeoutMillis:10000,
 statement_timeout:15000,
 query_timeout:20000,
 application_name:'siii-app',
});
pool.on('error',()=>{logger.error({code:'DATABASE_IDLE_CLIENT_ERROR'},'Database idle client failed')});
export const db=drizzle(pool,{schema});

let roleCheck:Promise<void>|undefined;
export function assertApplicationRole():Promise<void>{
 if(roleCheck)return roleCheck;
 roleCheck=pool.query<{privileged:boolean;can_ddl:boolean;app_member:boolean;migrator_member:boolean;owns_objects:boolean}>(`
  SELECT
   EXISTS(SELECT FROM pg_roles WHERE rolname IN(current_user,session_user) AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)) AS privileged,
   has_schema_privilege(current_user,'public','CREATE') AS can_ddl,
   pg_has_role(current_user,'siii_app','MEMBER') AS app_member,
   pg_has_role(session_user,'siii_migrator','MEMBER') AS migrator_member,
   EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_objects
 `).then(({rows})=>{
  const role=rows[0];
  if(!role||role.privileged||role.can_ddl||!role.app_member||role.migrator_member||role.owns_objects)throw new Error('DATABASE_ROLE_UNSAFE');
 }).catch((error:unknown)=>{
  roleCheck=undefined;
  if((error as {code?:string}).code==='42704')throw new Error('DATABASE_ROLE_UNSAFE');
  throw error;
 });
 return roleCheck;
}
