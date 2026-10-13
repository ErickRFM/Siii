import { NextRequest, NextResponse } from 'next/server';
import { eq,and,isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionMemberships, roleAssignments, securityAuditLog } from '../../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { canGrantRole, canManageMembership } from '@/shared/auth/roles';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
const schema=z.object({membershipId:z.string().uuid(),role:z.enum(['student','workshop_participant','teacher_pending','teacher','tutor','coordinator','admin','super_admin'])});
export async function POST(req:NextRequest,ctx:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!z.string().uuid().safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const a=await authorizeInstitution(institutionId,'roles.assign');if(!a)return jsonError('FORBIDDEN',403);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 if(!canGrantRole(a.access.roles,parsed.data.role))return jsonError('ROLE_GRANT_DENIED',403);
 const {membershipId,role}=parsed.data;
 const membership=await db.select().from(institutionMemberships).where(and(eq(institutionMemberships.id,membershipId),eq(institutionMemberships.institutionId,institutionId),eq(institutionMemberships.status,'active'))).limit(1);
 if(!membership.length || membership[0].userId===a.identity.id)return jsonError('INVALID_TARGET',403);
 const targetRoles=await db.select({role:roleAssignments.role}).from(roleAssignments)
   .where(and(eq(roleAssignments.membershipId,membershipId),isNull(roleAssignments.revokedAt)));
 if(!canManageMembership(a.access.roles,targetRoles.map(x=>x.role)))return jsonError('TARGET_ROLE_PROTECTED',403);
 const existing=await db.select({id:roleAssignments.id}).from(roleAssignments).where(and(eq(roleAssignments.membershipId,membershipId),eq(roleAssignments.role,role),isNull(roleAssignments.revokedAt))).limit(1);
 if(existing.length)return jsonError('ALREADY_ASSIGNED',409);
 // Partial unique DB index is the final race-condition guard.
 try {
  const rows=await db.transaction(async(tx)=>{
   const inserted=await tx.insert(roleAssignments).values({membershipId,role,grantedBy:a.identity.id}).returning({id:roleAssignments.id});
   await tx.insert(securityAuditLog).values({actorUserId:a.identity.id,institutionId,action:'role.assign',target:`membership:${membershipId}:role:${role}`});
   return inserted;
  });
  return NextResponse.json({data:rows[0]},{status:201});
 }catch {return jsonError('CONFLICT',409);}
}
