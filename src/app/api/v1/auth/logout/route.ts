import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { authSessions } from '../../../../../../db/schema';
import { digestToken, SESSION_COOKIE } from '@/shared/auth/session';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const raw=req.cookies.get(SESSION_COOKIE)?.value;
 if(raw)await db.update(authSessions).set({revokedAt:new Date()}).where(eq(authSessions.tokenHash,digestToken(raw)));
 const response=NextResponse.redirect(new URL('/login',req.url),303);
 response.cookies.set(SESSION_COOKIE,'',{path:'/',maxAge:0,httpOnly:true,sameSite:'lax'});
 return response;
}
