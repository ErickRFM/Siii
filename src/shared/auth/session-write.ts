import {createHash,randomBytes} from 'node:crypto';
import {and,eq,gt,inArray,isNull,ne,desc} from 'drizzle-orm';
import {authSessions} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import {SESSION_DAYS,SESSION_IDLE_MS,SESSION_LIMIT} from './session-policy';
export const digestToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export const generateToken=()=>randomBytes(32).toString('base64url');
export async function createSession(tx:Transaction,userId:string,now:Date){
 const token=generateToken(),expires=new Date(now.getTime()+SESSION_DAYS*86400000);
 const [session]=await tx.insert(authSessions).values({userId,tokenHash:digestToken(token),expiresAt:expires,lastSeenAt:now,createdAt:now}).returning({id:authSessions.id});
 const older=await tx.select({id:authSessions.id}).from(authSessions).where(and(eq(authSessions.userId,userId),ne(authSessions.id,session.id),isNull(authSessions.revokedAt),gt(authSessions.expiresAt,now),gt(authSessions.lastSeenAt,new Date(now.getTime()-SESSION_IDLE_MS)))).orderBy(desc(authSessions.createdAt),desc(authSessions.id));
 const excess=older.slice(SESSION_LIMIT-1).map(row=>row.id);
 if(excess.length)await tx.update(authSessions).set({revokedAt:now}).where(inArray(authSessions.id,excess));
 return {token,expires,revoked:excess.length};
}
export async function revokeUserSessions(tx:Transaction,userId:string,now=new Date()){
 return tx.update(authSessions).set({revokedAt:now}).where(and(eq(authSessions.userId,userId),isNull(authSessions.revokedAt))).returning({id:authSessions.id});
}
