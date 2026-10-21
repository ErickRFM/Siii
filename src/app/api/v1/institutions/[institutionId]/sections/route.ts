import {queueCompanionSectionSnapshot} from '@/integrations/companion/outbox/write-hook';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest, NextResponse } from 'next/server';
import { eq,and,desc,getTableColumns } from 'drizzle-orm';
import {parsePage,cursorTimestamp,cursorPredicate,pageEnvelope} from '@/shared/http/pagination';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { academicSections,academicTerms,academicCourses,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { registryCreate, registryUpdate } from '@/modules/registry/validation';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
const headers={'Cache-Control':'no-store'};
async function valid(ctx:Ctx){const {institutionId}=await ctx.params;return z.uuid().safeParse(institutionId).success?institutionId:null;}
function error(e:unknown){const x=e as {code?:string;cause?:{code?:string}};const c=x.code??x.cause?.code;if(c==='23505')return jsonError('DUPLICATE_SECTION',409);if(c==='23503'||c==='23514')return jsonError('INVALID_REFERENCE',422);throw e;}
export const GET=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const scope=id+':sections',page=parsePage(req,scope);
 if(!page)return jsonError('INVALID_PAGINATION',422);
 const rows=await db.select({...getTableColumns(academicSections),cursorAt:cursorTimestamp(academicSections.createdAt)}).from(academicSections)
  .where(and(eq(academicSections.institutionId,id),cursorPredicate(page,academicSections.createdAt,academicSections.id)))
  .orderBy(desc(academicSections.createdAt),desc(academicSections.id)).limit(page.limit+1);
 const result=pageEnvelope(rows,page,scope);
 return NextResponse.json({data:result.visible.map(({cursorAt,...row})=>{void cursorAt;return row}),page:result.page},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const payload:unknown=await req.json().catch(()=>null);
 const parsed=registryCreate.sections.safeParse(payload);if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 try{
  const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
    const [term]=await tx.select({id:academicTerms.id}).from(academicTerms).where(and(eq(academicTerms.id,parsed.data.termId),eq(academicTerms.institutionId,id),eq(academicTerms.status,'active'))).limit(1);
    const [course]=await tx.select({id:academicCourses.id}).from(academicCourses).where(and(eq(academicCourses.id,parsed.data.courseId),eq(academicCourses.institutionId,id),eq(academicCourses.status,'active'))).limit(1);
    if(!term||!course)return null;
    const [row]=await tx.insert(academicSections).values({...parsed.data,institutionId:id}).returning();
    await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:id,action:'section.create',target:'section:'+row.id});
    await queueCompanionSectionSnapshot(tx,{institutionId:id,sectionId:row.id,actorUserId:access.identity.id});
    return row;
  });
  return data?NextResponse.json({data},{status:201,headers}):jsonError('COURSE_OR_TERM_UNAVAILABLE',422);
 }catch(e){return error(e)}
});
export const PATCH=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=registryUpdate.sections.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 try{
  const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
   const [row]=await tx.update(academicSections).set({status:parsed.data.status,updatedAt:new Date()}).where(and(eq(academicSections.id,parsed.data.id),eq(academicSections.institutionId,id))).returning();
   if(!row)return null;
   await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:id,action:'section.status',target:'section:'+row.id});
   await queueCompanionSectionSnapshot(tx,{institutionId:id,sectionId:row.id,actorUserId:access.identity.id});
   return row;
  });
  return data?NextResponse.json({data},{headers}):jsonError('NOT_FOUND',404);
 }catch(e){return error(e)}
});
