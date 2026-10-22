import {randomUUID} from 'node:crypto';
import {and,or,lt,isNotNull,inArray,asc} from 'drizzle-orm';
import {db} from '../src/infrastructure/database';
import {authSessions,authThrottle,platformUsers} from '../db/schema';
import {SESSION_IDLE_MS} from '../src/shared/auth/session-policy';
import {audit} from '../src/shared/http/request-context';
import {logger} from '../src/shared/logging';
async function cleanup(){
 const now=new Date(),requestId=randomUUID(),totals={deletedSessions:0,deletedThrottleBuckets:0};
 for(let batch=0;batch<50;batch++){
  const result=await db.transaction(async tx=>{
   const expired=or(lt(authSessions.expiresAt,now),lt(authSessions.lastSeenAt,new Date(now.getTime()-SESSION_IDLE_MS)),isNotNull(authSessions.revokedAt));
   // Discover without locking; MFA/password writes hold user before factor, enrollment and session.
   // Session deletion cascades to enrollment rows, so session-first cleanup would invert that order.
   const candidates=await tx.select({id:authSessions.id,userId:authSessions.userId}).from(authSessions)
    .where(expired).orderBy(asc(authSessions.id)).limit(500);
   const candidateUsers=[...new Set(candidates.map(row=>row.userId))];
   const acquiredUsers=candidateUsers.length?await tx.select({id:platformUsers.id}).from(platformUsers)
    .where(inArray(platformUsers.id,candidateUsers)).orderBy(asc(platformUsers.id)).for('update',{skipLocked:true}):[];
   // Never wait on authentication locks; recheck expiry after acquiring the owning user locks.
   const expiredSessions=acquiredUsers.length?await tx.select({id:authSessions.id}).from(authSessions)
    .where(and(expired,inArray(authSessions.id,candidates.map(row=>row.id)),inArray(authSessions.userId,acquiredUsers.map(row=>row.id))))
    .orderBy(asc(authSessions.id)).limit(500).for('update',{skipLocked:true}):[];
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
export async function runCleanup(){
 for(let attempt=0;;attempt++){
  try{await cleanup();return;}catch(error){if(!transient(error)||attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,50*2**attempt));}
 }
}
