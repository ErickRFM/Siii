import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import type {NextRequest} from 'next/server';
import {eq} from 'drizzle-orm';
import {authThrottle} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
export function clientIp(req:NextRequest){
 // Only Vercel's documented overwritten header is trusted on that deployment.
 const value=process.env.VERCEL==='1'?req.headers.get('x-vercel-forwarded-for'):null;
 return value&&isIP(value)?value:'unknown';
}
export async function lockThrottle(tx:Transaction,scope:'login_account'|'login_ip',value:string,now:Date){
 const key=createHash('sha256').update(scope+'\0'+value).digest('hex');
 const ttl=scope==='login_ip'?60000:15*60000;
 const [row]=await tx.insert(authThrottle).values({key,scope,expiresAt:new Date(now.getTime()+60*60000)})
  .onConflictDoUpdate({target:authThrottle.key,set:{expiresAt:new Date(now.getTime()+60*60000)}}).returning();

 const reset=(!row.blockedUntil&&row.windowStartedAt.getTime()+ttl<=now.getTime()) || !!(row.blockedUntil&&row.blockedUntil<=now);
 if(reset){
  const [fresh]=await tx.update(authThrottle).set({failures:0,blockedUntil:null,windowStartedAt:now,expiresAt:new Date(now.getTime()+60*60000)}).where(eq(authThrottle.key,key)).returning();
  return {...fresh,reset:true};
 }
 return {...row,reset:false};
}
export async function consumeIp(tx:Transaction,ip:string,now:Date){
 const row=await lockThrottle(tx,'login_ip',ip,now);
 if(row.failures>=30 || (row.blockedUntil&&row.blockedUntil>now))return false;
 await tx.update(authThrottle).set({failures:row.failures+1,blockedUntil:row.failures>=29?new Date(now.getTime()+60000):null}).where(eq(authThrottle.key,row.key));
 return true;
}

