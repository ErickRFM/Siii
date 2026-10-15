import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {and,eq,desc,inArray,isNull,or,gt,gte,lte,like} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {db} from '@/infrastructure/database';
import {institutions,institutionMemberships,roleAssignments,securityAuditLog,institutionInvitations,invitationDeliveryOutbox} from '../../../db/schema';
import {getIdentity} from '@/shared/auth/session';
import {can,type Capability} from '@/shared/auth/capabilities';
import {storedGrant} from '@/shared/auth/institution-policy';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {uuid} from '@/shared/auth/validation';
import {withErrors} from '@/shared/http/route-errors';
import {audit,context} from '@/shared/http/request-context';
import {parsePage,pageEnvelope,cursorTimestamp,cursorPredicate} from '@/shared/http/pagination';
import {managementIdentity,managementVisibility,lockManagementContext,assertManagementContextCurrent,ManagementAuthorizationExpired} from './access';
import {settingsBody,statusBody,institutionDTO,auditFilters,projectAudit,MAX_ADMIN_VERSION} from './policy';

type Ctx={params:Promise<{institutionId:string}>};
const ok=(data:unknown)=>NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
async function validId(ctx:Ctx){const {institutionId}=await ctx.params;return uuid.safeParse(institutionId).success?institutionId:null;}
async function readAllowed(actor:NonNullable<Awaited<ReturnType<typeof managementIdentity>>>,capability:Capability){
 const rows=await db.select({grant:roleAssignments}).from(institutionMemberships).innerJoin(roleAssignments,eq(roleAssignments.membershipId,institutionMemberships.id))
  .where(and(eq(institutionMemberships.institutionId,actor.institution.id),eq(institutionMemberships.userId,actor.identity.id),eq(institutionMemberships.status,'active'),isNull(institutionMemberships.deletedAt),inArray(roleAssignments.role,['admin','super_admin']),eq(roleAssignments.scopeType,'institution'),isNull(roleAssignments.revokedAt),or(isNull(roleAssignments.expiresAt),gt(roleAssignments.expiresAt,new Date()))));
 return can({id:actor.identity.id,active:actor.identity.isActive,mustChangePassword:actor.identity.mustChangePassword,grants:rows.map(row=>storedGrant(row.grant,actor.institution.id))},capability,{institutionId:actor.institution.id,status:'active'},new Date());
}
async function stillVisible(userId:string,sessionId:string,institutionId:string){
 return (await db.select({id:institutions.id}).from(institutions).where(and(eq(institutions.id,institutionId),managementVisibility(userId,sessionId,institutionId))).limit(1)).length>0;
}
export const listManageable=withErrors(async(req:NextRequest)=>{
 const identity=await getIdentity();if(!identity||identity.mustChangePassword)return jsonError('FORBIDDEN',403);
 const scope='manageable-institutions:'+identity.id,page=parsePage(req,scope);if(!page)return jsonError('INVALID_PAGE',400);
 const rows=await db.select({institution:institutions,id:institutions.id,cursorAt:cursorTimestamp(institutions.createdAt)}).from(institutions)
  .where(and(managementVisibility(identity.id,identity.sessionId,institutions.id),cursorPredicate(page,institutions.createdAt,institutions.id)))
  .orderBy(desc(institutions.createdAt),desc(institutions.id)).limit(page.limit+1);
 const envelope=pageEnvelope(rows,page,scope),visible=[];
 for(const row of envelope.visible){if(!await stillVisible(identity.id,identity.sessionId,row.id))return jsonError('FORBIDDEN',403);visible.push(institutionDTO(row.institution));}
 return NextResponse.json({data:visible,page:envelope.page},{headers:{'Cache-Control':'no-store'}});
});
export const getSettings=withErrors(async(_req:NextRequest,ctx:Ctx)=>{
 const id=await validId(ctx);if(!id)return jsonError('INVALID_ID',400);
 const actor=await managementIdentity(id);if(!actor||!await readAllowed(actor,'institutions.manage'))return jsonError('FORBIDDEN',403);
 const [current]=await db.select().from(institutions).where(and(eq(institutions.id,id),managementVisibility(actor.identity.id,actor.identity.sessionId,id))).limit(1);
 if(!current||!await stillVisible(actor.identity.id,actor.identity.sessionId,id))return jsonError('FORBIDDEN',403);
 return ok(institutionDTO(current));
});
export const patchSettings=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await validId(ctx);if(!id)return jsonError('INVALID_ID',400);
 const input=settingsBody.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const actor=await managementIdentity(id);if(!actor)return jsonError('FORBIDDEN',403);
 try{
  const result=await db.transaction(async tx=>{
   const current=await lockManagementContext(tx,actor.identity,id,'settings.manage');if(!current)return {error:'FORBIDDEN',status:403} as const;
   const before=current.institution;
   if(before.status==='archived')return {error:'INSTITUTION_ARCHIVED',status:409} as const;
   if(before.adminVersion!==input.data.expectedVersion)return {error:'STALE_RESOURCE',status:409} as const;
   if(before.adminVersion===MAX_ADMIN_VERSION)return {error:'VERSION_LIMIT_REACHED',status:409} as const;
   const {reason,expectedVersion,...fields}=input.data;
   const [after]=await tx.update(institutions).set({...fields,adminVersion:expectedVersion+1,updatedAt:current.now}).where(eq(institutions.id,id)).returning();
   await audit(tx,{institutionId:id,actorUserId:actor.identity.id,action:'institution.settings.update',target:'institution:'+id,requestId:context(req).requestId,details:{reason,before:institutionDTO(before),after:institutionDTO(after)}});
   assertManagementContextCurrent(current,'settings.manage');
   return {data:institutionDTO(after)} as const;
  });
  return 'error'in result?jsonError(result.error!,result.status!):ok(result.data);
 }catch(error){if(error instanceof ManagementAuthorizationExpired)return jsonError('FORBIDDEN',403);const code=(error as {code?:string;cause?:{code?:string}}).code??(error as {cause?:{code?:string}}).cause?.code;if(code==='23505')return jsonError('INSTITUTION_CODE_EXISTS',409);throw error;}
});
export const postStatus=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await validId(ctx);if(!id)return jsonError('INVALID_ID',400);
 const input=statusBody.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const actor=await managementIdentity(id);if(!actor)return jsonError('FORBIDDEN',403);
 try{const result=await db.transaction(async tx=>{
  const current=await lockManagementContext(tx,actor.identity,id,'institutions.manage');if(!current)return {error:'FORBIDDEN',status:403} as const;
  const before=current.institution,{status,reason,expectedVersion}=input.data;
  if(before.status==='archived')return {error:'INSTITUTION_ARCHIVED',status:409} as const;
  if(before.adminVersion!==expectedVersion)return {error:'STALE_RESOURCE',status:409} as const;
  if(before.adminVersion===MAX_ADMIN_VERSION)return {error:'VERSION_LIMIT_REACHED',status:409} as const;
  if(before.status===status)return {error:'INVALID_STATUS_TRANSITION',status:409} as const;
  const now=new Date();let revokedInvitations=0,cancelledDeliveries=0;
  if(status!=='active'){
   revokedInvitations=(await tx.update(institutionInvitations).set({state:'revoked',consumedAt:now,updatedAt:now}).where(and(eq(institutionInvitations.institutionId,id),eq(institutionInvitations.state,'pending'))).returning({id:institutionInvitations.id})).length;
   cancelledDeliveries=(await tx.update(invitationDeliveryOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(invitationDeliveryOutbox.institutionId,id),eq(invitationDeliveryOutbox.state,'queued'))).returning({id:invitationDeliveryOutbox.id})).length;
  }
  const [after]=await tx.update(institutions).set({status,adminVersion:expectedVersion+1,updatedAt:now}).where(eq(institutions.id,id)).returning();
  await audit(tx,{institutionId:id,actorUserId:actor.identity.id,action:'institution.status.change',target:'institution:'+id,requestId:context(req).requestId,details:{reason,before:{status:before.status,version:before.adminVersion},after:{status:after.status,version:after.adminVersion,revokedInvitations,cancelledDeliveries}}});
  assertManagementContextCurrent(current,'institutions.manage');
  return {data:institutionDTO(after)} as const;
 });
 return 'error'in result?jsonError(result.error!,result.status!):ok(result.data);
 }catch(error){if(error instanceof ManagementAuthorizationExpired)return jsonError('FORBIDDEN',403);throw error;}
});
export const getAudit=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const id=await validId(ctx);if(!id)return jsonError('INVALID_ID',400);
 const actor=await managementIdentity(id);if(!actor||!await readAllowed(actor,'audit.read'))return jsonError('FORBIDDEN',403);
 const filters=auditFilters(req.nextUrl.searchParams);if(!filters)return jsonError('INVALID_PAGE',400);
 const scope='institution-audit:'+id+':'+createHash('sha256').update(JSON.stringify(filters)).digest('hex'),pageUrl=new URL(req.url);
 for(const key of ['action','targetKind','from','to'])pageUrl.searchParams.delete(key);
 const page=parsePage(new NextRequest(pageUrl),scope);if(!page)return jsonError('INVALID_PAGE',400);
 const member=alias(institutionMemberships,'audit_actor_member');
 const rows=await db.select({id:securityAuditLog.id,action:securityAuditLog.action,target:securityAuditLog.target,details:securityAuditLog.details,createdAt:securityAuditLog.createdAt,cursorAt:cursorTimestamp(securityAuditLog.createdAt),actorMembershipId:member.id,actorLabel:member.displayName})
  .from(securityAuditLog).leftJoin(member,and(eq(member.institutionId,securityAuditLog.institutionId),eq(member.userId,securityAuditLog.actorUserId)))
  .where(and(eq(securityAuditLog.institutionId,id),managementVisibility(actor.identity.id,actor.identity.sessionId,id),
   filters.action?eq(securityAuditLog.action,filters.action):undefined,filters.targetKind?like(securityAuditLog.target,filters.targetKind+':%'):undefined,
   filters.from?gte(securityAuditLog.createdAt,new Date(filters.from)):undefined,filters.to?lte(securityAuditLog.createdAt,new Date(filters.to)):undefined,
   cursorPredicate(page,securityAuditLog.createdAt,securityAuditLog.id)))
  .orderBy(desc(securityAuditLog.createdAt),desc(securityAuditLog.id)).limit(page.limit+1);
 const envelope=pageEnvelope(rows,page,scope);
 if(!await stillVisible(actor.identity.id,actor.identity.sessionId,id))return jsonError('FORBIDDEN',403);
 const data=envelope.visible.map(row=>({id:row.id,action:/^[a-z][a-z0-9_.-]{0,99}$/.test(row.action)?row.action:'event.unknown',...projectAudit(row.details,row.target),actor:row.actorMembershipId?{membershipId:row.actorMembershipId,label:row.actorLabel??'Miembro institucional'}:null,createdAt:row.createdAt.toISOString()}));
 return NextResponse.json({data,page:envelope.page},{headers:{'Cache-Control':'no-store'}});
});
