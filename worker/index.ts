import {randomUUID} from 'node:crypto';
import {or,lt,isNotNull} from 'drizzle-orm';
import {db,pool,assertApplicationRole} from '../src/infrastructure/database';
import {authSessions,authThrottle} from '../db/schema';
import {SESSION_IDLE_MS} from '../src/shared/auth/session-policy';
import {audit} from '../src/shared/http/request-context';
import {logger} from '../src/shared/logging';
async function cleanup(){
 const now=new Date(),requestId=randomUUID();
 const result=await db.transaction(async tx=>{
  const sessions=await tx.delete(authSessions).where(or(lt(authSessions.expiresAt,now),lt(authSessions.lastSeenAt,new Date(now.getTime()-SESSION_IDLE_MS)),isNotNull(authSessions.revokedAt))).returning({id:authSessions.id});
  const buckets=await tx.delete(authThrottle).where(lt(authThrottle.expiresAt,now)).returning({key:authThrottle.key});
  if(sessions.length||buckets.length)await audit(tx,{action:'auth.sessions.cleanup',target:'system:sessions',requestId,details:{after:{deletedSessions:sessions.length,deletedThrottleBuckets:buckets.length}}});
  return {deletedSessions:sessions.length,deletedThrottleBuckets:buckets.length};
 });
 logger.info({requestId,...result},'Expired authentication records cleaned');
}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_REQUIRED');
 await assertApplicationRole();
 await cleanup();
 if(process.argv.includes('--once'))return;
 let stopping=false;
 process.once('SIGTERM',()=>{stopping=true;});
 process.once('SIGINT',()=>{stopping=true;});
 let nextCleanup=Date.now()+15*60000;
 while(!stopping){
  await new Promise(resolve=>setTimeout(resolve,1000));if(stopping)break;
  if(Date.now()>=nextCleanup){await cleanup();nextCleanup=Date.now()+15*60000;}
 }
}
main().catch(()=>{logger.error({code:'SESSION_CLEANUP_FAILED'},'Session cleanup failed');process.exitCode=1;}).finally(()=>pool.end());
