import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { and,eq,desc,or,isNull,gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionalAnnouncements,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import {legacyAllows} from '@/shared/auth/institution-policy';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { noticeCreate,noticeStatus } from '@/modules/services/validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function identifier(c:Ctx){const p=await c.params;return z.uuid().safeParse(p.institutionId).success?p.institutionId:null;}
export const GET=withDomainErrors(async (_req:NextRequest,c:Ctx)=>{
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(id,'institutions.read');if(!access)return jsonError('FORBIDDEN',403);
 const admin=legacyAllows(access.subject,'academic.manage',id);
 const condition=admin?eq(institutionalAnnouncements.institutionId,id):and(
  eq(institutionalAnnouncements.institutionId,id),eq(institutionalAnnouncements.status,'PUBLISHED'),
  or(isNull(institutionalAnnouncements.expiresAt),gt(institutionalAnnouncements.expiresAt,new Date()))
 );
 const rows=await db.select({id:institutionalAnnouncements.id,title:institutionalAnnouncements.title,body:institutionalAnnouncements.body,
  status:institutionalAnnouncements.status,publishedAt:institutionalAnnouncements.publishedAt,expiresAt:institutionalAnnouncements.expiresAt})
  .from(institutionalAnnouncements).where(condition).orderBy(desc(institutionalAnnouncements.createdAt)).limit(200);
 return NextResponse.json({data:rows,truncated:rows.length===200},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=noticeCreate.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
  const [row]=await tx.insert(institutionalAnnouncements).values({
   institutionId:id,authorUserId:access.identity.id,title:parsed.data.title,body:parsed.data.body,
   expiresAt:parsed.data.expiresAt?new Date(parsed.data.expiresAt):null
  }).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:access.identity.id,action:'announcement.draft.create',target:'announcement:'+row.id});
  return row;
 });
 return NextResponse.json({data:result},{status:201,headers});
});
export const PATCH=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=noticeStatus.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
  const [row]=await tx.select().from(institutionalAnnouncements).where(and(eq(institutionalAnnouncements.id,parsed.data.id),eq(institutionalAnnouncements.institutionId,id))).limit(1);
  if(!row)return {error:'NOT_FOUND',status:404} as const;
  const valid=(row.status==='DRAFT'&&parsed.data.status==='PUBLISHED')||(row.status==='PUBLISHED'&&parsed.data.status==='ARCHIVED');
  if(!valid)return {error:'INVALID_PUBLICATION_TRANSITION',status:409} as const;
  if(parsed.data.status==='PUBLISHED'&&row.expiresAt&&row.expiresAt<=new Date())return {error:'EXPIRED_NOTICE',status:422} as const;
  const [item]=await tx.update(institutionalAnnouncements).set({status:parsed.data.status,
   publishedAt:parsed.data.status==='PUBLISHED'?new Date():row.publishedAt})
   .where(and(eq(institutionalAnnouncements.id,row.id),eq(institutionalAnnouncements.institutionId,id))).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:access.identity.id,action:'announcement.'+parsed.data.status.toLowerCase(),target:'announcement:'+row.id});
  return {data:item,status:200} as const;
 });
 return 'error'in result&&typeof result.error==='string'?jsonError(result.error,result.status):
 NextResponse.json({data:'data'in result?result.data:null},{headers});
});
