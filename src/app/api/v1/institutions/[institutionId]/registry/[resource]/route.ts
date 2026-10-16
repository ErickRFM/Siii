import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { academicPrograms, institutionalStudents, institutionalTeachers, securityAuditLog } from '../../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { registryCreate, registryUpdate } from '@/modules/registry/validation';

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
export const GET=withDomainErrors(async (_req:NextRequest,ctx:Context)=>{
  const p=await context(ctx); if(!p)return jsonError('INVALID_RESOURCE',404);
  if(!await authorizeInstitution(p.institutionId,'academic.manage'))return jsonError('FORBIDDEN',403);
  const data=p.resource==='students'
    ? await db.select().from(institutionalStudents).where(eq(institutionalStudents.institutionId,p.institutionId)).orderBy(desc(institutionalStudents.createdAt)).limit(200)
    : await db.select().from(institutionalTeachers).where(eq(institutionalTeachers.institutionId,p.institutionId)).orderBy(desc(institutionalTeachers.createdAt)).limit(200);
  return NextResponse.json({data,truncated:data.length===200},{headers});
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
  try{
    const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
      const rows=p.resource==='students'
        ? (()=>{const v=registryUpdate.students.safeParse(body);return v.success?tx.update(institutionalStudents).set({status:v.data.status,updatedAt:new Date()}).where(and(eq(institutionalStudents.id,v.data.id),eq(institutionalStudents.institutionId,p.institutionId))).returning():null})()
        : (()=>{const v=registryUpdate.teachers.safeParse(body);return v.success?tx.update(institutionalTeachers).set({status:v.data.status,updatedAt:new Date()}).where(and(eq(institutionalTeachers.id,v.data.id),eq(institutionalTeachers.institutionId,p.institutionId))).returning():null})();
      if(!rows)return {invalid:true} as const;
      const changed=await rows;
      if(!changed.length)return {missing:true} as const;
      await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:p.institutionId,action:'registry.'+p.resource+'.status',target:p.resource+':'+changed[0].id});
      return {data:changed[0]};
    });
    if('invalid'in data)return jsonError('VALIDATION_ERROR',422);
    if('missing'in data)return jsonError('NOT_FOUND',404);
    return NextResponse.json({data:data.data},{headers});
  }catch(error){return dbError(error)}
});
