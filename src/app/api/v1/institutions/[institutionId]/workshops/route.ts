import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { and,eq,desc,gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionalWorkshops,institutionalTeachers,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import {legacyAllows} from '@/shared/auth/institution-policy';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { workshopCreate,workshopStatus } from '@/modules/services/validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function identifier(c:Ctx){const p=await c.params;return z.uuid().safeParse(p.institutionId).success?p.institutionId:null;}
export const GET=withDomainErrors(async (_req:NextRequest,c:Ctx)=>{
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const auth=await authorizeInstitution(id,'institutions.read');if(!auth)return jsonError('FORBIDDEN',403);
 const canManage=legacyAllows(auth.subject,'academic.manage',id);
 const where=canManage?eq(institutionalWorkshops.institutionId,id):and(eq(institutionalWorkshops.institutionId,id),eq(institutionalWorkshops.status,'PUBLISHED'),gt(institutionalWorkshops.endsAt,new Date()));
 const data=await db.select().from(institutionalWorkshops).where(where).orderBy(desc(institutionalWorkshops.startsAt)).limit(200);
 return NextResponse.json({data,truncated:data.length===200},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const auth=await authorizeInstitution(id,'academic.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=workshopCreate.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await domainTransaction(auth,{permission:'academic.manage'},async tx=>{
  const [teacher]=await tx.select({id:institutionalTeachers.id}).from(institutionalTeachers)
   .where(and(eq(institutionalTeachers.id,parsed.data.teacherId),eq(institutionalTeachers.institutionId,id),eq(institutionalTeachers.status,'active'))).limit(1);
  if(!teacher)return null;
  const [row]=await tx.insert(institutionalWorkshops).values({...parsed.data,
   startsAt:new Date(parsed.data.startsAt),endsAt:new Date(parsed.data.endsAt),institutionId:id}).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:auth.identity.id,action:'workshop.draft.create',target:'workshop:'+row.id});
  return row;
 });
 return result?NextResponse.json({data:result},{status:201,headers}):jsonError('FACILITATOR_NOT_ACTIVE',422);
});
export const PATCH=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const auth=await authorizeInstitution(id,'academic.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=workshopStatus.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await domainTransaction(auth,{permission:'academic.manage'},async tx=>{
  const [row]=await tx.select().from(institutionalWorkshops).where(and(eq(institutionalWorkshops.id,parsed.data.id),eq(institutionalWorkshops.institutionId,id))).limit(1);
  if(!row)return {error:'NOT_FOUND',status:404} as const;
  const allowed=(row.status==='DRAFT'&&parsed.data.status==='PUBLISHED')||(row.status==='PUBLISHED'&&parsed.data.status==='CANCELLED');
  if(!allowed)return {error:'INVALID_WORKSHOP_TRANSITION',status:409} as const;
  if(parsed.data.status==='PUBLISHED'&&row.startsAt<=new Date())return {error:'WORKSHOP_ALREADY_STARTED',status:422} as const;
  const [changed]=await tx.update(institutionalWorkshops).set({status:parsed.data.status})
   .where(and(eq(institutionalWorkshops.id,row.id),eq(institutionalWorkshops.institutionId,id))).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:auth.identity.id,action:'workshop.'+parsed.data.status.toLowerCase(),target:'workshop:'+row.id});
  return {data:changed,status:200} as const;
 });
 return 'error'in result&&typeof result.error==='string'?jsonError(result.error,result.status):
 NextResponse.json({data:'data'in result?result.data:null},{headers});
});
