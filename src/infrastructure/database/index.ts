import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {databaseConnectionOptions} from './connection-options';
import * as schema from '../../../db/schema';
import { logger } from '@/shared/logging';
import {APPLICATION_ROLE_QUERY,assertRoleInspection,type ApplicationRoleInspection} from './role-policy';

// Each Vercel function instance owns its own process-local pool. A default of
// five connections per instance exhausted the session pooler's 15-slot limit.
// Keep serverless instances small; use Supabase's transaction pooler for
// DATABASE_URL when available and retain a separate direct URL for migrations.
const defaultMax=process.env.VERCEL==='1'?1:5;
const requested=Number(process.env.SIII_POOL_MAX ?? defaultMax);
if(!Number.isInteger(requested)||requested<1||requested>20)throw new Error('INVALID_POOL_SIZE');
const configured=process.env.VERCEL==='1'?Math.min(requested,1):requested;

type DatabaseState={pool:pg.Pool;roleCheck?:Promise<void>};
const globalState=globalThis as typeof globalThis & {__siiiDatabaseState?:DatabaseState};
const state:DatabaseState=globalState.__siiiDatabaseState ?? (() : DatabaseState => {
 const instancePool=new pg.Pool({
  ...databaseConnectionOptions(process.env.DATABASE_URL,process.env.SIII_DATABASE_CA),
  max:configured,
  connectionTimeoutMillis:5000,
  idleTimeoutMillis:1000,
  maxLifetimeSeconds:30,
  allowExitOnIdle:true,
  statement_timeout:15000,
  query_timeout:20000,
  application_name:'siii-app',
 });
 instancePool.on('error',()=>{logger.error({code:'DATABASE_IDLE_CLIENT_ERROR'},'Database idle client failed')});
 return {pool:instancePool};
})();
globalState.__siiiDatabaseState=state;
export const pool=state.pool;
export const db=drizzle(pool,{schema});

export function assertApplicationRole():Promise<void>{
 if(state.roleCheck)return state.roleCheck;
 const check=pool.query<ApplicationRoleInspection>(APPLICATION_ROLE_QUERY)
  .then(({rows})=>assertRoleInspection(rows[0]))
  .catch((error:unknown)=>{
   if(state.roleCheck===check)state.roleCheck=undefined;
   if((error as {code?:string}).code==='42704')throw new Error('DATABASE_ROLE_UNSAFE');
   throw error;
  });
 state.roleCheck=check;
 return check;
}
