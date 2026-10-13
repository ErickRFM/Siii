import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import argon2 from 'argon2';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { authSessions, platformUsers, securityAuditLog } from '../../../../../../../db/schema';
import { getIdentity } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
export const runtime='nodejs';
const schema=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(12).max(128)})
.refine(x=>x.currentPassword!==x.newPassword,{path:['newPassword'],message:'New password must differ'});
export async function POST(req:NextRequest){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const identity=await getIdentity();if(!identity)return jsonError('UNAUTHENTICATED',401);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('INVALID_PASSWORD_POLICY',422);
 const users=await db.select({passwordHash:platformUsers.passwordHash}).from(platformUsers).where(eq(platformUsers.id,identity.id)).limit(1);
 if(!users[0]?.passwordHash || !await argon2.verify(users[0].passwordHash,parsed.data.currentPassword))return jsonError('INVALID_CREDENTIALS',401);
 const newHash=await argon2.hash(parsed.data.newPassword,{type:argon2.argon2id});
 await db.transaction(async(tx)=>{
  await tx.update(platformUsers).set({passwordHash:newHash,mustChangePassword:false,failedLoginAttempts:0,lockedUntil:null}).where(eq(platformUsers.id,identity.id));
  await tx.update(authSessions).set({revokedAt:new Date()}).where(and(eq(authSessions.userId,identity.id),ne(authSessions.id,identity.sessionId)));
  await tx.insert(securityAuditLog).values({actorUserId:identity.id,action:'auth.password.change',target:`user:${identity.id}`});
 });
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
