import {DomainConflict,domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import {parsePage,cursorTimestamp,cursorPredicate,pageEnvelope} from '@/shared/http/pagination';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { academicPrograms, institutionalStudents, institutionalTeachers, securityAuditLog } from '../../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { registryCreate, registryUpdate, registryProfileUpdate } from '@/modules/registry/validation';
import {queueRegistrySectionSnapshots} from '@/integrations/companion/outbox/registry-change';

export const runtime='nodejs';
type Context={params:Promise<{institutionId:string;resource:string}>};
const headers={'Cache-Control':'no-store'};
async function context(ctx:Context) {
  const p=await ctx.params;
  return z.uuid().safeParse(p.institutionId).success && ['students','teachers'].includes(p.resource) ? p : null;
}
function dbError(error:unknown) {
  const e=error as {code?:string;cause?:{code?:string}};
  const code=e.code??e.cause?.code;
  if(code==='23505')return jsonError('DUPLICATE_RECORD',409);
  if(code==='23503'||code==='23514')return jsonError('INSTITUTIONAL_CONSTRAINT',422);
  throw error;
}
export const GET=withDomainErrors(async (req:NextRequest,ctx:Context)=>{
  const p=await context(ctx); if(!p)return jsonError('INVALID_RESOURCE',404);
  if(!await authorizeInstitution(p.institutionId,'academic.manage'))return jsonError('FORBIDDEN',403);
  const scope=p.institutionId+':registry:'+p.resource,page=parsePage(req,scope);
  if(!page)return jsonError('INVALID_PAGINATION',422);
  const rows=p.resource==='students'
    ? await db.select({...getTableColumns(institutionalStudents),cursorAt:cursorTimestamp(institutionalStudents.createdAt)}).from(institutionalStudents)
      .where(and(eq(institutionalStudents.institutionId,p.institutionId),cursorPredicate(page,institutionalStudents.createdAt,institutionalStudents.id)))
      .orderBy(desc(institutionalStudents.createdAt),desc(institutionalStudents.id)).limit(page.limit+1)
    : await db.select({...getTableColumns(institutionalTeachers),cursorAt:cursorTimestamp(institutionalTeachers.createdAt)}).from(institutionalTeachers)
      .where(and(eq(institutionalTeachers.institutionId,p.institutionId),cursorPredicate(page,institutionalTeachers.createdAt,institutionalTeachers.id)))
      .orderBy(desc(institutionalTeachers.createdAt),desc(institutionalTeachers.id)).limit(page.limit+1);
  const result=pageEnvelope<(typeof rows)[number]>(rows,page,scope);
  return NextResponse.json({data:result.visible.map(({cursorAt,...row})=>{void cursorAt;return row}),page:result.page},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,ctx:Context)=>{
  if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
  const p=await context(ctx);if(!p)return jsonError('INVALID_RESOURCE',404);
  const access=await authorizeInstitution(p.institutionId,'academic.manage');
  if(!access)return jsonError('FORBIDDEN',403);
  const body:unknown=await req.json().catch(()=>null);
  try {
    if(p.resource==='students') {
      const parsed=registryCreate.students.safeParse(body);
      if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
      const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
        const programs=await tx.select({id:academicPrograms.id}).from(academicPrograms).where(and(eq(academicPrograms.id,parsed.data.programId),eq(academicPrograms.institutionId,p.institutionId),eq(academicPrograms.status,'active'))).limit(1);
        if(!programs.length)return null;
        const [row]=await tx.insert(institutionalStudents).values({...parsed.data,institutionId:p.institutionId}).returning();
        await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:p.institutionId,action:'registry.student.create',target:'student:'+row.id});
        return row;
      });
      return data?NextResponse.json({data},{status:201,headers}):jsonError('PROGRAM_NOT_FOUND',422);
    }
    const parsed=registryCreate.teachers.safeParse(body);
    if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
    const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
      const [row]=await tx.insert(institutionalTeachers).values({...parsed.data,institutionId:p.institutionId}).returning();
      await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:p.institutionId,action:'registry.teacher.create',target:'teacher:'+row.id});
      return row;
    });
    return NextResponse.json({data},{status:201,headers});
  }catch(error){return dbError(error)}
});
export const PATCH=withDomainErrors(async (req:NextRequest,ctx:Context)=>{
  if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
  const p=await context(ctx);if(!p)return jsonError('INVALID_RESOURCE',404);
  const access=await authorizeInstitution(p.institutionId,'academic.manage');
  if(!access)return jsonError('FORBIDDEN',403);
  const body:unknown=await req.json().catch(()=>null);
  const auditRequestId=requestId(req.headers);
  try{
    if(typeof body==='object'&&body!==null&&'kind'in body){
      const parsed=registryProfileUpdate.safeParse(body);
      if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
      const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
        const table=p.resource==='students'?institutionalStudents:institutionalTeachers;
        const [current]=await tx.select().from(table).where(and(eq(table.id,parsed.data.id),eq(table.institutionId,p.institutionId))).for('update');
        if(!current)return null;
        const before={firstName:current.firstName,lastName:current.lastName,institutionalEmail:current.institutionalEmail};
        const {expected,profile}=parsed.data;
        if(before.firstName!==expected.firstName||before.lastName!==expected.lastName||before.institutionalEmail!==expected.institutionalEmail)throw new DomainConflict('REGISTRY_PROFILE_CONFLICT');
        const [row]=await tx.update(table).set({...profile,updatedAt:new Date()}).where(and(eq(table.id,current.id),eq(table.institutionId,p.institutionId))).returning();
        await tx.insert(securityAuditLog).values({requestId:auditRequestId,actorUserId:access.identity.id,institutionId:p.institutionId,action:'registry.'+p.resource+'.profile',target:p.resource+':'+row.id,details:{before,after:profile}});
        if((before.firstName!==profile.firstName||before.lastName!==profile.lastName)&&(p.resource==='students'||current.status==='active')){
          await queueRegistrySectionSnapshots(tx,{institutionId:p.institutionId,resource:p.resource as 'students'|'teachers',sourceId:row.id,actorUserId:access.identity.id,requestId:auditRequestId});
        }
        return row;
      });
      return data?NextResponse.json({data},{headers}):jsonError('NOT_FOUND',404);
    }
    const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
      const parsed=(p.resource==='students'?registryUpdate.students:registryUpdate.teachers).safeParse(body);
      if(!parsed.success)return {invalid:true} as const;
      const table=p.resource==='students'?institutionalStudents:institutionalTeachers;
      const [current]=await tx.select().from(table).where(and(eq(table.id,parsed.data.id),eq(table.institutionId,p.institutionId))).for('update');
      if(!current)return {missing:true} as const;
      const [changed]=await tx.update(table).set({status:parsed.data.status,updatedAt:new Date()}).where(and(eq(table.id,current.id),eq(table.institutionId,p.institutionId))).returning();
      await tx.insert(securityAuditLog).values({requestId:auditRequestId,actorUserId:access.identity.id,institutionId:p.institutionId,action:'registry.'+p.resource+'.status',target:p.resource+':'+changed.id});
      if(current.status!==changed.status){
        await queueRegistrySectionSnapshots(tx,{institutionId:p.institutionId,resource:p.resource as 'students'|'teachers',sourceId:changed.id,actorUserId:access.identity.id,requestId:auditRequestId});
      }
      return {data:changed};
    });
    if('invalid'in data)return jsonError('VALIDATION_ERROR',422);
    if('missing'in data)return jsonError('NOT_FOUND',404);
    return NextResponse.json({data:data.data},{headers});
  }catch(error){return dbError(error)}
});
