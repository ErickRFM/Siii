import {NextRequest,NextResponse} from 'next/server';
import {and,eq,isNull} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {authSessions,platformUsers} from '../../../../../../db/schema';
import {digestToken} from '@/shared/auth/session-write';
import {SESSION_COOKIE,cookieOptions} from '@/shared/auth/session-policy';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {context,audit} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
export const runtime='nodejs';
export const POST=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const token=req.cookies.get(SESSION_COOKIE)?.value;
 if(token){
  const {requestId}=context(req);
  await db.transaction(async tx=>{
   const [candidate]=await tx.select({userId:authSessions.userId}).from(authSessions).where(eq(authSessions.tokenHash,digestToken(token))).limit(1);
   if(!candidate)return;
   await tx.select({id:platformUsers.id}).from(platformUsers).where(eq(platformUsers.id,candidate.userId)).for('update');
   const [session]=await tx.update(authSessions).set({revokedAt:new Date()}).where(and(eq(authSessions.tokenHash,digestToken(token)),isNull(authSessions.revokedAt))).returning({id:authSessions.id,userId:authSessions.userId});
   if(session)await audit(tx,{actorUserId:session.userId,action:'auth.logout',target:'session:'+session.id,requestId,details:{after:{revoked:true}}});
  });
 }
 const response=NextResponse.redirect(new URL('/login',req.url),303);
 response.cookies.set(SESSION_COOKIE,'',{...cookieOptions(),maxAge:0});
 return response;
});
