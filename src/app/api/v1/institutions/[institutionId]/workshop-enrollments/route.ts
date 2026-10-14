import { NextRequest,NextResponse } from 'next/server';
import { and,eq,desc,sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionalWorkshops,workshopEnrollments,institutionalStudents,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { workshopEnroll,workshopWithdraw } from '@/modules/services/validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function identifier(c:Ctx){const p=await c.params;return z.uuid().safeParse(p.institutionId).success?p.institutionId:null;}
export async function GET(_req:NextRequest,c:Ctx){
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const rows=await db.select().from(workshopEnrollments).where(eq(workshopEnrollments.institutionId,id))
  .orderBy(desc(workshopEnrollments.createdAt)).limit(200);
 return NextResponse.json({data:rows,truncated:rows.length===200},{headers});
}
export async function POST(req:NextRequest,c:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const auth=await authorizeInstitution(id,'academic.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=workshopEnroll.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 try{
  const outcome=await db.transaction(async tx=>{
   const lock=await tx.execute(sql`SELECT id FROM institutional_workshops WHERE id=${parsed.data.workshopId} AND institution_id=${id} FOR UPDATE`);
   if(!lock.rows.length)return {error:'WORKSHOP_NOT_FOUND',status:404} as const;
   const [workshop]=await tx.select().from(institutionalWorkshops).where(and(eq(institutionalWorkshops.id,parsed.data.workshopId),eq(institutionalWorkshops.institutionId,id))).limit(1);
   const [student]=await tx.select({id:institutionalStudents.id}).from(institutionalStudents)
    .where(and(eq(institutionalStudents.id,parsed.data.studentId),eq(institutionalStudents.institutionId,id),eq(institutionalStudents.status,'active'))).limit(1);
   if(!workshop||!student)return {error:'STUDENT_OR_WORKSHOP_UNAVAILABLE',status:422} as const;
   if(workshop.status!=='PUBLISHED'||workshop.startsAt<=new Date())return {error:'WORKSHOP_NOT_OPEN',status:409} as const;
   const [count]=await tx.select({n:sql<number>`COUNT(*)::int`}).from(workshopEnrollments)
    .where(and(eq(workshopEnrollments.workshopId,workshop.id),eq(workshopEnrollments.institutionId,id),eq(workshopEnrollments.status,'ENROLLED')));
   if(count.n>=workshop.capacity)return {error:'WORKSHOP_FULL',status:409} as const;
   const [row]=await tx.insert(workshopEnrollments).values({...parsed.data,institutionId:id}).returning();
   await tx.insert(securityAuditLog).values({institutionId:id,actorUserId:auth.identity.id,action:'workshop.student.enroll',target:'enrollment:'+row.id});
   return {data:row,status:201} as const;
  });
  return 'error'in outcome&&typeof outcome.error==='string'?jsonError(outcome.error,outcome.status):
   NextResponse.json({data:'data'in outcome?outcome.data:null},{status:201,headers});
 }catch(e){const v=e as {code?:string;cause?:{code?:string}};if((v.code??v.cause?.code)==='23505')return jsonError('ALREADY_ENROLLED',409);throw e}
}
export async function PATCH(req:NextRequest,c:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const auth=await authorizeInstitution(id,'academic.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=workshopWithdraw.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await db.transaction(async tx=>{
  const [row]=await tx.update(workshopEnrollments).set({status:'WITHDRAWN'})
   .where(and(eq(workshopEnrollments.id,parsed.data.id),eq(workshopEnrollments.institutionId,id),eq(workshopEnrollments.status,'ENROLLED'))).returning();
  if(!row)return null;
  await tx.insert(securityAuditLog).values({institutionId:id,actorUserId:auth.identity.id,action:'workshop.student.withdraw',target:'enrollment:'+row.id});
  return row;
 });
 return result?NextResponse.json({data:result},{headers}):jsonError('NOT_ENROLLED',409);
}
