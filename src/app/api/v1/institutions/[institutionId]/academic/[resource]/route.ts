import {NextRequest,NextResponse} from 'next/server';
import {and,eq} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {academicPrograms,curriculumVersions} from '../../../../../../../../db/schema';
import {authorizeInstitution} from '@/shared/auth/session';
import {lockWriteAccess} from '@/shared/auth/write-access';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {uuid} from '@/shared/auth/validation';
import {catalogResource,type CatalogResource} from '@/modules/academic/catalog-validation';
import {catalogRegistry} from '@/modules/academic/catalog-registry';
import {canTransition} from '@/modules/academic/catalog-state';
import {context,audit} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {parsePage,pageEnvelope} from '@/shared/http/pagination';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string;resource:string}>};
const noCache={'Cache-Control':'no-store'};
async function routeContext(ctx:Ctx){
 const {institutionId,resource}=await ctx.params;
 const parsed=catalogResource.safeParse(resource);
 return uuid.safeParse(institutionId).success&&parsed.success?{institutionId,resource:parsed.data as CatalogResource}:null;
}
function constraintResponse(error:unknown){
 const e=error as {code?:string;cause?:{code?:string}},code=e.code??e.cause?.code;
 if(code==='23505')return jsonError('DUPLICATE_CODE',409);
 if(code==='23503'||code==='23514')return jsonError('ACADEMIC_CONSTRAINT',422);
 throw error;
}
export const GET=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const params=await routeContext(ctx);if(!params)return jsonError('INVALID_RESOURCE',404);
 if(!await authorizeInstitution(params.institutionId,'academic.read'))return jsonError('FORBIDDEN',403);
 const scope='academic:'+params.institutionId+':'+params.resource;
 const input=parsePage(req,scope);if(!input)return jsonError('INVALID_PAGE',400);
 const entry=catalogRegistry[params.resource],rows=await entry.list(params.institutionId,input);
 const {visible,page}=pageEnvelope(rows,input,scope);
 return NextResponse.json({data:visible.map(entry.publicRow),page},{headers:noCache});
});
export const POST=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const params=await routeContext(ctx);if(!params)return jsonError('INVALID_RESOURCE',404);
 const access=await authorizeInstitution(params.institutionId,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const {institutionId,resource}=params,entry=catalogRegistry[resource];
 const parsed=entry.createSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const {requestId}=context(req);
 try{
  const result=await db.transaction(async tx=>{
   if(!await lockWriteAccess(tx,access.identity,access.access,'academic.manage'))return {error:'FORBIDDEN',status:403} as const;
   if(resource==='curricula'){
    const {programId}=parsed.data as {programId:string};
    const [parent]=await tx.select({id:academicPrograms.id}).from(academicPrograms)
     .where(and(eq(academicPrograms.id,programId),eq(academicPrograms.institutionId,institutionId),eq(academicPrograms.status,'active'))).limit(1).for('update');
    if(!parent)return {error:'PROGRAM_NOT_FOUND',status:422} as const;
   }
   const row=await entry.insert(tx,institutionId,parsed.data);
   const data=entry.publicRow(row);
   await audit(tx,{actorUserId:access.identity.id,institutionId,action:'academic.'+resource+'.create',target:resource+':'+row.id,requestId,details:{after:data}});
   return {data} as const;
  });
  if('error'in result && result.error)return jsonError(result.error,result.status ?? 500);
  return NextResponse.json(result,{status:201,headers:noCache});
 }catch(error){return constraintResponse(error);}
});
export const PATCH=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const params=await routeContext(ctx);if(!params)return jsonError('INVALID_RESOURCE',404);
 const access=await authorizeInstitution(params.institutionId,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const {institutionId,resource}=params,entry=catalogRegistry[resource];
 const parsed=entry.updateSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const change=parsed.data;if(!change.name&&!change.status)return jsonError('NO_CHANGES',422);
 const {requestId}=context(req);
 try{
  const result=await db.transaction(async tx=>{
   if(!await lockWriteAccess(tx,access.identity,access.access,'academic.manage'))return {error:'FORBIDDEN',status:403} as const;
   if(resource==='curricula'){
    // programId is immutable. Lock parent before child, matching create/archive order.
    const [candidate]=await tx.select({programId:curriculumVersions.programId}).from(curriculumVersions)
     .where(and(eq(curriculumVersions.id,change.id),eq(curriculumVersions.institutionId,institutionId))).limit(1);
    if(!candidate)return {error:'NOT_FOUND',status:404} as const;
    const [parent]=await tx.select({status:academicPrograms.status}).from(academicPrograms)
     .where(and(eq(academicPrograms.id,candidate.programId),eq(academicPrograms.institutionId,institutionId))).limit(1).for('update');
    if(!parent)return {error:'NOT_FOUND',status:404} as const;
    if(change.status==='active'&&parent.status!=='active')return {error:'PROGRAM_NOT_ACTIVE',status:409} as const;
   }
   const before=await entry.find(tx,institutionId,change.id);
   if(!before)return {error:'NOT_FOUND',status:404} as const;
   if(change.status&&!canTransition(resource,before.status,change.status))return {error:'INVALID_TRANSITION',status:409} as const;
   if(resource==='programs'&&change.status==='archived'){
    const plans=await tx.select({id:curriculumVersions.id}).from(curriculumVersions)
     .where(and(eq(curriculumVersions.programId,change.id),eq(curriculumVersions.institutionId,institutionId),eq(curriculumVersions.status,'active'))).limit(1);
    if(plans.length)return {error:'ACTIVE_DEPENDENCIES',status:409} as const;
   }
   const row=await entry.update(tx,institutionId,change);
   if(!row)return {error:'NOT_FOUND',status:404} as const;
   const data=entry.publicRow(row);
   await audit(tx,{actorUserId:access.identity.id,institutionId,action:'academic.'+resource+'.update',target:resource+':'+row.id,requestId,details:{before:entry.publicRow(before),after:data}});
   return {data} as const;
  });
  if('error'in result && result.error)return jsonError(result.error,result.status ?? 500);
  return NextResponse.json(result,{headers:noCache});
 }catch(error){return constraintResponse(error);}
});
