import {randomUUID} from 'node:crypto';
import {or,lt,isNotNull,inArray,asc} from 'drizzle-orm';
import {db,pool,assertApplicationRole} from '../src/infrastructure/database';
import {authSessions,authThrottle} from '../db/schema';
import {SESSION_IDLE_MS} from '../src/shared/auth/session-policy';
import {audit} from '../src/shared/http/request-context';
import {logger} from '../src/shared/logging';
async function cleanup(){
 const now=new Date(),requestId=randomUUID(),totals={deletedSessions:0,deletedThrottleBuckets:0};
 for(let batch=0;batch<50;batch++){
  const result=await db.transaction(async tx=>{
   // Never wait on authentication locks: password/MFA flows can already hold a bucket/user.
   const expiredSessions=await tx.select({id:authSessions.id}).from(authSessions)
    .where(or(lt(authSessions.expiresAt,now),lt(authSessions.lastSeenAt,new Date(now.getTime()-SESSION_IDLE_MS)),isNotNull(authSessions.revokedAt)))
    .orderBy(asc(authSessions.id)).limit(500).for('update',{skipLocked:true});
   const expiredBuckets=await tx.select({key:authThrottle.key}).from(authThrottle).where(lt(authThrottle.expiresAt,now))
    .orderBy(asc(authThrottle.key)).limit(500).for('update',{skipLocked:true});
   const sessions=expiredSessions.length?await tx.delete(authSessions).where(inArray(authSessions.id,expiredSessions.map(row=>row.id))).returning({id:authSessions.id}):[];
   const buckets=expiredBuckets.length?await tx.delete(authThrottle).where(inArray(authThrottle.key,expiredBuckets.map(row=>row.key))).returning({key:authThrottle.key}):[];
   if(sessions.length||buckets.length)await audit(tx,{action:'auth.sessions.cleanup',target:'system:sessions',requestId,details:{after:{deletedSessions:sessions.length,deletedThrottleBuckets:buckets.length}}});
   return {deletedSessions:sessions.length,deletedThrottleBuckets:buckets.length};
  });
  totals.deletedSessions+=result.deletedSessions;totals.deletedThrottleBuckets+=result.deletedThrottleBuckets;
  if(result.deletedSessions<500&&result.deletedThrottleBuckets<500)break;
 }
 logger.info({requestId,...totals},'Expired authentication records cleaned');
}
function transient(error:unknown){
 const value=error as {code?:string;cause?:{code?:string}};
 return ['40P01','40001'].includes(value.code??value.cause?.code??'');
}
async function runCleanup(){
 for(let attempt=0;;attempt++){
  try{await cleanup();return;}catch(error){if(!transient(error)||attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,50*2**attempt));}
 }
}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_REQUIRED');
 await assertApplicationRole();
 let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
 await runCleanup();if(process.argv.includes('--once'))return;
 let nextCleanup=Date.now()+15*60000;
 while(!stopping){
  await new Promise(resolve=>setTimeout(resolve,1000));if(stopping)break;
  if(Date.now()>=nextCleanup){
   try{await runCleanup();nextCleanup=Date.now()+15*60000;}
   catch{logger.error({code:'SESSION_CLEANUP_RETRY_SCHEDULED'},'Cleanup failed; scheduled retry');nextCleanup=Date.now()+60000;}
  }
 }
}
main().catch(()=>{logger.error({code:'SESSION_CLEANUP_FAILED'},'Session cleanup failed');process.exitCode=1;}).finally(()=>pool.end());
