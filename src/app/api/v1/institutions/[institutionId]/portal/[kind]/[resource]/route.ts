import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getIdentity} from '@/shared/auth/session';
import {jsonError} from '@/shared/auth/guards';
import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {personalContext,personalCollection,personalProfile,studentResources,teacherResources} from '@/modules/portal/read-model';
import {parsePage} from '@/shared/http/pagination';
import {createHash} from 'node:crypto';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string;kind:string;resource:string}>};
export const GET=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 const {institutionId,kind,resource}=await ctx.params;
 if(!z.uuid().safeParse(institutionId).success||!['student','teacher'].includes(kind)||(kind==='student'?studentResources:teacherResources).every(item=>item!==resource))return jsonError('NOT_FOUND',404);
 if(!await getIdentity())return jsonError('UNAUTHORIZED',401);
 const context=await personalContext(institutionId,kind as 'student'|'teacher');if(!context)return jsonError('FORBIDDEN',403);
 const scope=`portal:${context.access.membershipId}:${kind}:${resource}`;
 if(resource==='profile'&&req.nextUrl.search)return jsonError('INVALID_QUERY',422);
 const page=resource==='profile'?null:parsePage(req,scope);if(resource!=='profile'&&!page)return jsonError('INVALID_QUERY',422);
 const profile=await personalProfile(context);
 // An opaque cache discriminator, never a credential or a client-supplied permission.
 // Include the session so a different login cannot reuse an earlier user's snapshot.
 const revision=createHash('sha256').update(JSON.stringify({actor:context.identity.id,session:context.identity.sessionId,authVersion:context.identity.authVersion,institutionId,membership:context.access.membershipId,kind,profile,grants:context.access.grants.map(grant=>JSON.stringify(grant)).sort()})).digest('hex');
 const headers={'Cache-Control':'no-store','X-SIII-Portal-Context':revision,'X-SIII-Portal-Actor':context.identity.id};
 if(resource==='profile'){
  return NextResponse.json({data:profile},{headers});
 }
 // Bind every SQL relation to the record resolved for this response. A concurrent
 // account re-link must not attach another record's rows to the previous context.
 const collection=profile?await personalCollection({...context,recordId:profile.id},resource,page!,scope):{data:[],page:{nextCursor:null}};
 return NextResponse.json(collection,{headers});
});
