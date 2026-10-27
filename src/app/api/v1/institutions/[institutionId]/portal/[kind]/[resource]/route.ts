import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getIdentity} from '@/shared/auth/session';
import {jsonError} from '@/shared/auth/guards';
import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {personalContext,personalCollection,personalProfile,studentResources,teacherResources} from '@/modules/portal/read-model';
import {parsePage} from '@/shared/http/pagination';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string;kind:string;resource:string}>};
export const GET=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 const {institutionId,kind,resource}=await ctx.params;
 if(!z.uuid().safeParse(institutionId).success||!['student','teacher'].includes(kind)||(kind==='student'?studentResources:teacherResources).every(item=>item!==resource))return jsonError('NOT_FOUND',404);
 if(!await getIdentity())return jsonError('UNAUTHORIZED',401);
 const context=await personalContext(institutionId,kind as 'student'|'teacher');if(!context)return jsonError('FORBIDDEN',403);
 const scope=`portal:${context.access.membershipId}:${kind}:${resource}`;
 if(resource==='profile'){
  if(req.nextUrl.search)return jsonError('INVALID_QUERY',422);
  return NextResponse.json({data:await personalProfile(context)},{headers:{'Cache-Control':'no-store'}});
 }
 const page=parsePage(req,scope);if(!page)return jsonError('INVALID_QUERY',422);
 return NextResponse.json(await personalCollection(context,resource,page,scope),{headers:{'Cache-Control':'no-store'}});
});
