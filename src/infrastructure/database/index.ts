import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../../db/schema';
import { logger } from '@/shared/logging';
import {APPLICATION_ROLE_QUERY,assertRoleInspection,type ApplicationRoleInspection} from './role-policy';
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
 roleCheck=pool.query<ApplicationRoleInspection>(APPLICATION_ROLE_QUERY).then(({rows})=>assertRoleInspection(rows[0])).catch((error:unknown)=>{
  roleCheck=undefined;
  if((error as {code?:string}).code==='42704')throw new Error('DATABASE_ROLE_UNSAFE');
  throw error;
 });
 return roleCheck;
}
