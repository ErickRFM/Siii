import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import argon2 from 'argon2';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { platformUsers, authSessions, securityAuditLog } from '../../../../../../db/schema';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { digestToken, generateToken, SESSION_COOKIE, SESSION_DAYS } from '@/shared/auth/session';
export const runtime='nodejs';
const bodySchema=z.object({username:z.string().trim().min(3).max(120),password:z.string().min(1).max(512)});
export async function POST(req:NextRequest){
  if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
  const parsed=bodySchema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return jsonError('INVALID_CREDENTIALS',401);
  const username=parsed.data.username.toLowerCase();
  const invalid=()=>jsonError('INVALID_CREDENTIALS',401);
  const rows=await db.select().from(platformUsers).where(eq(platformUsers.username,username)).limit(1);
  const user=rows[0];
  if(!user || !user.isActive || !user.passwordHash || (user.lockedUntil&&user.lockedUntil>new Date()))return invalid();
  const valid=await argon2.verify(user.passwordHash,parsed.data.password).catch(()=>false);
  if(!valid){
    await db.update(platformUsers).set({failedLoginAttempts:sql`${platformUsers.failedLoginAttempts}+1`,
      lockedUntil:sql`CASE WHEN ${platformUsers.failedLoginAttempts} >= 4 THEN now() + interval '15 minutes' ELSE ${platformUsers.lockedUntil} END`})
      .where(and(eq(platformUsers.id,user.id),eq(platformUsers.isActive,true)));
    return invalid();
  }
  const token=generateToken();
  const expires=new Date(Date.now()+SESSION_DAYS*86400000);
  await db.transaction(async(tx)=>{
    await tx.update(platformUsers).set({failedLoginAttempts:0,lockedUntil:null}).where(eq(platformUsers.id,user.id));
    await tx.insert(authSessions).values({userId:user.id,tokenHash:digestToken(token),expiresAt:expires});
    await tx.insert(securityAuditLog).values({actorUserId:user.id,action:'auth.login',target:`user:${user.id}`});
  });
  const response=NextResponse.json({ok:true,mustChangePassword:user.mustChangePassword},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires});
  return response;
}
