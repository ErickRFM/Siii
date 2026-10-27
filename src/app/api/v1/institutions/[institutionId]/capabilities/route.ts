import {NextRequest,NextResponse} from 'next/server';
import {and,eq} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {academicPrograms,campuses} from '../../../../../../../db/schema';
import {institutionContext} from '@/shared/auth/session';
import {uuid} from '@/shared/auth/validation';
import {jsonError} from '@/shared/auth/guards';
import {disclose} from '@/shared/auth/disclosure';
import type {GrantScope} from '@/shared/auth/capabilities';
import {withErrors} from '@/shared/http/route-errors';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
export const GET=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const actor=await institutionContext(institutionId);if(!actor)return jsonError('FORBIDDEN',403);
 const params=req.nextUrl.searchParams;
 if([...params.keys()].some(key=>!['scopeType','scopeId'].includes(key))||params.getAll('scopeType').length>1||params.getAll('scopeId').length>1)return jsonError('INVALID_SCOPE',400);
 let scope:GrantScope|undefined;
 if(params.size){
  const scopeType=params.get('scopeType'),scopeId=params.get('scopeId');
  if((scopeType!=='program'&&scopeType!=='campus')||!uuid.safeParse(scopeId).success)return jsonError('INVALID_SCOPE',400);
  const table=scopeType==='program'?academicPrograms:campuses;
  const [parent]=await db.select({id:table.id}).from(table).where(and(eq(table.id,scopeId!),eq(table.institutionId,institutionId),eq(table.status,'active'))).limit(1);
  if(!parent)return jsonError('INVALID_SCOPE',404);
  scope={institutionId,scopeType,scopeId};
 }
 return NextResponse.json({data:disclose(actor.subject,actor.access,actor.identity,new Date(),scope)},{headers:{'Cache-Control':'no-store'}});
});
