import { NextRequest,NextResponse } from 'next/server';
import { and,eq,isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { teacherAccountLinks,institutionalTeachers,institutionMemberships,roleAssignments,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { gradeLinkCreate,gradeLinkRevoke } from '@/modules/grading/validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function getContext(ctx:Ctx){const p=await ctx.params;return z.uuid().safeParse(p.institutionId).success?p.institutionId:null;}
function conflict(e:unknown){const x=e as {code?:string;cause?:{code?:string}};if((x.code??x.cause?.code)==='23505')return jsonError('TEACHER_ALREADY_LINKED',409);throw e;}

export async function GET(_req:NextRequest,ctx:Ctx){
 const institutionId=await getContext(ctx);if(!institutionId)return jsonError('NOT_FOUND',404);
 if(!await authorizeInstitution(institutionId,'users.manage'))return jsonError('FORBIDDEN',403);
 const rows=await db.select().from(teacherAccountLinks).where(and(eq(teacherAccountLinks.institutionId,institutionId),isNull(teacherAccountLinks.revokedAt))).limit(200);
 return NextResponse.json({data:rows,truncated:rows.length===200},{headers});
}
export async function POST(req:NextRequest,ctx:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const institutionId=await getContext(ctx);if(!institutionId)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(institutionId,'users.manage');if(!access)return jsonError('FORBIDDEN',403);
 const p=gradeLinkCreate.safeParse(await req.json().catch(()=>null));if(!p.success)return jsonError('VALIDATION_ERROR',422);
 if(p.data.membershipId===access.access.membershipId)return jsonError('SELF_LINK_NOT_ALLOWED',403);
 try {
 const data=await db.transaction(async tx=>{
  const [teacher]=await tx.select({id:institutionalTeachers.id}).from(institutionalTeachers)
   .where(and(eq(institutionalTeachers.id,p.data.teacherId),eq(institutionalTeachers.institutionId,institutionId),eq(institutionalTeachers.status,'active'))).limit(1);
  const [member]=await tx.select({id:institutionMemberships.id}).from(institutionMemberships)
   .where(and(eq(institutionMemberships.id,p.data.membershipId),eq(institutionMemberships.institutionId,institutionId),eq(institutionMemberships.status,'active'))).limit(1);
  const [role]=await tx.select({id:roleAssignments.id}).from(roleAssignments)
   .where(and(eq(roleAssignments.membershipId,p.data.membershipId),eq(roleAssignments.role,'teacher'),isNull(roleAssignments.revokedAt))).limit(1);
  if(!teacher||!member||!role)return null;
  const [link]=await tx.insert(teacherAccountLinks).values({...p.data,institutionId}).returning();
  await tx.insert(securityAuditLog).values({institutionId,actorUserId:access.identity.id,action:'teacher.identity.link',target:'teacher:'+teacher.id});
  return link;
 });
 return data?NextResponse.json({data},{status:201,headers}):jsonError('TEACHER_MEMBERSHIP_NOT_VERIFIED',422);
 }catch(e){return conflict(e)}
}
export async function PATCH(req:NextRequest,ctx:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const institutionId=await getContext(ctx);if(!institutionId)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(institutionId,'users.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=gradeLinkRevoke.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const data=await db.transaction(async tx=>{
  const [row]=await tx.update(teacherAccountLinks).set({revokedAt:new Date()})
   .where(and(eq(teacherAccountLinks.id,parsed.data.id),eq(teacherAccountLinks.institutionId,institutionId),isNull(teacherAccountLinks.revokedAt))).returning();
  if(!row)return null;
  await tx.insert(securityAuditLog).values({institutionId,actorUserId:access.identity.id,action:'teacher.identity.revoke',target:'link:'+row.id});
  return row;
 });
 return data?NextResponse.json({data},{headers}):jsonError('NOT_FOUND',404);
}
