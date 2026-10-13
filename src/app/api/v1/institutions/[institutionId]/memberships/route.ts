import { NextRequest, NextResponse } from 'next/server';
import { eq,and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionMemberships, platformUsers, people, securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
const uuid=z.string().uuid();
export async function GET(_req:NextRequest,ctx:Ctx){
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const a=await authorizeInstitution(institutionId,'users.read');if(!a)return jsonError('FORBIDDEN',403);
 const rows=await db.select({id:institutionMemberships.id,status:institutionMemberships.status,userId:platformUsers.id,username:platformUsers.username,firstName:people.firstName,lastName:people.lastName})
 .from(institutionMemberships).innerJoin(platformUsers,eq(institutionMemberships.userId,platformUsers.id))
 .innerJoin(people,eq(platformUsers.personId,people.id))
 .where(eq(institutionMemberships.institutionId,institutionId)).limit(100);
 return NextResponse.json({data:rows},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest,ctx:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const a=await authorizeInstitution(institutionId,'users.manage');if(!a)return jsonError('FORBIDDEN',403);
 const parsed=z.object({userId:uuid}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const target=await db.select({id:platformUsers.id}).from(platformUsers).where(and(eq(platformUsers.id,parsed.data.userId),eq(platformUsers.isActive,true))).limit(1);
 if(!target.length)return jsonError('USER_NOT_FOUND',404);
 const rows=await db.transaction(async(tx)=>{
   const values=await tx.insert(institutionMemberships).values({institutionId,userId:parsed.data.userId}).onConflictDoNothing().returning({id:institutionMemberships.id});
   if(values.length)await tx.insert(securityAuditLog).values({actorUserId:a.identity.id,institutionId,action:'membership.create',target:`user:${parsed.data.userId}`});
   return values;
 });
 if(!rows.length)return jsonError('MEMBERSHIP_EXISTS',409);
 return NextResponse.json({data:rows[0]},{status:201});
}
