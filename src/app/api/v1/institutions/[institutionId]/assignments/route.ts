import {personScheduleConflict} from '@/modules/scheduling/person-conflict';
import {domainTransaction,withDomainErrors,DomainConflict} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { eq,and,desc,isNull,getTableColumns } from 'drizzle-orm';
import {parsePage,cursorTimestamp,cursorPredicate,pageEnvelope} from '@/shared/http/pagination';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionalTeachers,academicSections,sectionTeachers,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { registryCreate,registryUpdate } from '@/modules/registry/validation';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
const headers={'Cache-Control':'no-store'};
async function valid(ctx:Ctx){const {institutionId}=await ctx.params;return z.uuid().safeParse(institutionId).success?institutionId:null;}
function fail(e:unknown){const x=e as {code?:string;cause?:{code?:string}};const c=x.code??x.cause?.code;if(c==='23505')return jsonError('ALREADY_ASSIGNED',409);if(c==='23503')return jsonError('TENANT_CONSTRAINT',422);throw e;}
export const GET=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const sectionId=req.nextUrl.searchParams.get('sectionId');
 if(req.nextUrl.searchParams.getAll('sectionId').length>1||(sectionId!==null&&!z.uuid().safeParse(sectionId).success))return jsonError('VALIDATION_ERROR',422);
 const scope=id+':assignments:section='+(sectionId??'*'),pageUrl=req.nextUrl.clone();pageUrl.searchParams.delete('sectionId');
 const page=parsePage(new NextRequest(pageUrl),scope);if(!page)return jsonError('INVALID_PAGINATION',422);
 const rows=await db.select({...getTableColumns(sectionTeachers),cursorAt:cursorTimestamp(sectionTeachers.createdAt)}).from(sectionTeachers)
  .where(and(eq(sectionTeachers.institutionId,id),isNull(sectionTeachers.revokedAt),...(sectionId?[eq(sectionTeachers.sectionId,sectionId)]:[]),cursorPredicate(page,sectionTeachers.createdAt,sectionTeachers.id)))
  .orderBy(desc(sectionTeachers.createdAt),desc(sectionTeachers.id)).limit(page.limit+1);
 const result=pageEnvelope(rows,page,scope);
 return NextResponse.json({data:result.visible.map(({cursorAt,...row})=>{void cursorAt;return row}),page:result.page},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=registryCreate.assignments.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 try{
  const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
    const [section]=await tx.select().from(academicSections).where(and(eq(academicSections.id,parsed.data.sectionId),eq(academicSections.institutionId,id))).limit(1);
    const [teacher]=await tx.select().from(institutionalTeachers).where(and(eq(institutionalTeachers.id,parsed.data.teacherId),eq(institutionalTeachers.institutionId,id))).limit(1);
    if(!section||section.status==='archived'||!teacher||teacher.status!=='active')return null;
    if(await personScheduleConflict(tx,id,section.id,teacher.id,'teacher'))throw new DomainConflict('SCHEDULE_CONFLICT');
    const [row]=await tx.insert(sectionTeachers).values({...parsed.data,institutionId:id}).returning();
    await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:id,action:'teacher.assign',target:'assignment:'+row.id});
    return row;
  });
  return data?NextResponse.json({data},{status:201,headers}):jsonError('ASSIGNMENT_BLOCKED',422);
 }catch(e){return fail(e)}
});
export const PATCH=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=registryUpdate.assignments.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
   const [row]=await tx.update(sectionTeachers).set({revokedAt:new Date(),updatedAt:new Date()}).where(and(eq(sectionTeachers.id,parsed.data.id),eq(sectionTeachers.institutionId,id),isNull(sectionTeachers.revokedAt))).returning();
   if(!row)return null;
   await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:id,action:'teacher.unassign',target:'assignment:'+row.id});
   return row;
 });
 return data?NextResponse.json({data},{headers}):jsonError('NOT_ASSIGNED',409);
});
