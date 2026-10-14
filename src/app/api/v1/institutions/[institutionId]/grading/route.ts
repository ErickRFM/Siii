import { NextRequest, NextResponse } from 'next/server';
import { and,eq,sql,desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { academicSections,assessmentComponents,assessmentScores,sectionEnrollments,gradePublications,finalGrades,securityAuditLog } from '../../../../../../../db/schema';
import { teachingScope } from '@/modules/grading/teaching-scope';
import { gradeCommand,calculateWeightedGrade } from '@/modules/grading/validation';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
export const runtime='nodejs';
const noCache={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function ctxId(ctx:Ctx){const p=await ctx.params;return z.uuid().safeParse(p.institutionId).success?p.institutionId:null;}
function fail(e:unknown){const v=e as {code?:string;cause?:{code?:string}};const code=v.code??v.cause?.code;
 if(code==='23505')return jsonError('DUPLICATE_OPERATION',409);
 if(code==='23503'||code==='23514')return jsonError('GRADE_CONSTRAINT',422);
 throw e;
}
export async function GET(req:NextRequest,ctx:Ctx){
 const institutionId=await ctxId(ctx),sectionId=req.nextUrl.searchParams.get('sectionId');
 if(!institutionId||!sectionId||!z.uuid().safeParse(sectionId).success)return jsonError('INVALID_SECTION',422);
 if(!await teachingScope(institutionId,sectionId))return jsonError('FORBIDDEN',403);
 const [components,scores,publications]=await Promise.all([
  db.select().from(assessmentComponents).where(and(eq(assessmentComponents.institutionId,institutionId),eq(assessmentComponents.sectionId,sectionId))),
  db.select({id:assessmentScores.id,componentId:assessmentScores.componentId,studentId:assessmentScores.studentId,scoreHundredths:assessmentScores.scoreHundredths})
   .from(assessmentScores).innerJoin(assessmentComponents,eq(assessmentScores.componentId,assessmentComponents.id))
   .where(and(eq(assessmentScores.institutionId,institutionId),eq(assessmentComponents.sectionId,sectionId))),
  db.select({id:gradePublications.id,version:gradePublications.version,publishedAt:gradePublications.publishedAt})
   .from(gradePublications).where(and(eq(gradePublications.institutionId,institutionId),eq(gradePublications.sectionId,sectionId))).orderBy(desc(gradePublications.version))
 ]);
 return NextResponse.json({components,scores,publications},{headers:noCache});
}
export async function POST(req:NextRequest,ctx:Ctx){
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const institutionId=await ctxId(ctx);if(!institutionId)return jsonError('INVALID_INSTITUTION',404);
 const input=gradeCommand.safeParse(await req.json().catch(()=>null));
 if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const payload=input.data;
 let sectionId=payload.kind==='score'?null:payload.sectionId;
 if(payload.kind==='score'){
  const [component]=await db.select({sectionId:assessmentComponents.sectionId}).from(assessmentComponents)
   .where(and(eq(assessmentComponents.id,payload.componentId),eq(assessmentComponents.institutionId,institutionId))).limit(1);
  sectionId=component?.sectionId??null;
 }
 if(!sectionId)return jsonError('COMPONENT_NOT_FOUND',404);
 const access=await teachingScope(institutionId,sectionId);
 if(!access)return jsonError('FORBIDDEN',403);
 try{
  const result=await db.transaction(async tx=>{
   const rows=await tx.execute(sql`SELECT id FROM academic_sections WHERE id=${sectionId} AND institution_id=${institutionId} FOR UPDATE`);
   if(!rows.rows.length)return {error:'SECTION_NOT_FOUND',status:404} as const;
   if(payload.kind==='component'){
    const existing=await tx.select({id:gradePublications.id}).from(gradePublications)
     .where(and(eq(gradePublications.institutionId,institutionId),eq(gradePublications.sectionId,sectionId))).limit(1);
    if(existing.length)return {error:'GRADE_ALREADY_PUBLISHED',status:409} as const;
    const components=await tx.select({weight:assessmentComponents.weight}).from(assessmentComponents)
     .where(and(eq(assessmentComponents.sectionId,sectionId),eq(assessmentComponents.institutionId,institutionId)));
    if(components.reduce((sum,c)=>sum+c.weight,0)+payload.weight>100)return {error:'WEIGHT_OVER_100',status:422} as const;
    const [item]=await tx.insert(assessmentComponents).values({
      institutionId,sectionId,code:payload.code,title:payload.title,weight:payload.weight,
    }).returning();
    await tx.insert(securityAuditLog).values({institutionId,actorUserId:access.identity.id,action:'grade.component.create',target:'component:'+item.id});
    return {data:item,status:201} as const;
   }
   if(payload.kind==='score'){
    const exists=await tx.select({id:gradePublications.id}).from(gradePublications)
      .where(and(eq(gradePublications.institutionId,institutionId),eq(gradePublications.sectionId,sectionId))).limit(1);
    if(exists.length)return {error:'GRADE_ALREADY_PUBLISHED',status:409} as const;
    const [student]=await tx.select({id:sectionEnrollments.studentId}).from(sectionEnrollments)
      .where(and(eq(sectionEnrollments.institutionId,institutionId),eq(sectionEnrollments.sectionId,sectionId),
       eq(sectionEnrollments.studentId,payload.studentId),eq(sectionEnrollments.status,'enrolled'))).limit(1);
    if(!student)return {error:'STUDENT_NOT_ENROLLED',status:422} as const;
    const [item]=await tx.insert(assessmentScores).values({
      institutionId,componentId:payload.componentId,studentId:payload.studentId,
      scoreHundredths:payload.scoreHundredths,updatedBy:access.identity.id,
    }).onConflictDoUpdate({target:[assessmentScores.componentId,assessmentScores.studentId],
      set:{scoreHundredths:payload.scoreHundredths,updatedBy:access.identity.id,updatedAt:new Date()}}).returning();
    await tx.insert(securityAuditLog).values({institutionId,actorUserId:access.identity.id,action:'grade.score.save',target:'score:'+item.id});
    return {data:item,status:200} as const;
   }
   const [replay]=await tx.select().from(gradePublications)
      .where(and(eq(gradePublications.institutionId,institutionId),eq(gradePublications.operationId,payload.operationId))).limit(1);
   if(replay)return replay.sectionId===sectionId?{data:replay,status:200} as const:{error:'OPERATION_ID_REUSED',status:409} as const;
   const existing=await tx.select({id:gradePublications.id}).from(gradePublications)
    .where(and(eq(gradePublications.institutionId,institutionId),eq(gradePublications.sectionId,sectionId))).limit(1);
   if(existing.length)return {error:'ACTA_ALREADY_PUBLISHED_CORRECTION_REQUIRED',status:409} as const;
   const parts=await tx.select().from(assessmentComponents).where(and(eq(assessmentComponents.institutionId,institutionId),eq(assessmentComponents.sectionId,sectionId)));
   if(!parts.length||parts.reduce((sum,c)=>sum+c.weight,0)!==100)return {error:'INVALID_WEIGHT_SUM',status:422} as const;
   const students=await tx.select({studentId:sectionEnrollments.studentId}).from(sectionEnrollments)
     .where(and(eq(sectionEnrollments.institutionId,institutionId),eq(sectionEnrollments.sectionId,sectionId),eq(sectionEnrollments.status,'enrolled')));
   if(!students.length)return {error:'EMPTY_ROSTER',status:422} as const;
   const scores=await tx.select({componentId:assessmentScores.componentId,studentId:assessmentScores.studentId,scoreHundredths:assessmentScores.scoreHundredths})
    .from(assessmentScores).innerJoin(assessmentComponents,eq(assessmentScores.componentId,assessmentComponents.id))
    .where(and(eq(assessmentScores.institutionId,institutionId),eq(assessmentComponents.sectionId,sectionId)));
   const finals:{studentId:string;scoreHundredths:number}[]=[];
   for(const student of students){
    const own=parts.map(part=>{
      const score=scores.find(s=>s.componentId===part.id&&s.studentId===student.studentId);
      return score?{scoreHundredths:score.scoreHundredths,weight:part.weight}:null;
    });
    if(own.some(x=>x===null))return {error:'INCOMPLETE_GRADES',status:422} as const;
    finals.push({studentId:student.studentId,scoreHundredths:calculateWeightedGrade(own as {scoreHundredths:number;weight:number}[])});
   }
   const [publication]=await tx.insert(gradePublications).values({
    institutionId,sectionId,operationId:payload.operationId,publishedBy:access.identity.id,version:1,
   }).returning();
   await tx.insert(finalGrades).values(finals.map(s=>({institutionId,publicationId:publication.id,...s})));
   await tx.insert(securityAuditLog).values({institutionId,actorUserId:access.identity.id,action:'grade.acta.publish',target:'publication:'+publication.id});
   return {data:publication,status:201} as const;
  });
  if('error' in result && typeof result.error==='string')return jsonError(result.error,result.status);
   if(!('data' in result))return jsonError('INVALID_GRADE_STATE',409);
   return NextResponse.json({data:result.data},{status:result.status,headers:noCache});
 }catch(e){return fail(e)}
}
