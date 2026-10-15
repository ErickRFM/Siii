import {createHash} from 'node:crypto';
import {z} from 'zod';
import {NextRequest,NextResponse} from 'next/server';
import {and,or,eq,desc,inArray,isNull,isNotNull,ilike,exists,sql} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutionMemberships,platformUsers,people,roleAssignments,membershipEvents,institutionInvitations,invitationDeliveryOutbox} from '../../../db/schema';
import {authorizeCapability} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {uuid} from '@/shared/auth/validation';
import {can,canManageTarget,administratorState,type Capability} from '@/shared/auth/capabilities';
import {anotherActiveAdministrator,storedGrant,liveGrant} from '@/shared/auth/institution-policy';
import {lockWriteCapability} from '@/shared/auth/write-access';
import {targetGrants,invalidatePrivileges} from '@/shared/auth/privilege-write';
import {institutionVisibility} from '@/shared/auth/read-access';
import {privilegedAssuranceAllows} from '@/shared/auth/privileged-policy';
import {audit,context,type Transaction} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {parsePage,pageEnvelope,cursorTimestamp,cursorPredicate} from '@/shared/http/pagination';
import {profileBody,lifecycleBody,lifecycleTransition,membershipFilters,escapeLike,reason} from './policy';
import {projectUserHistory} from './history';
import {issuePasswordReset} from '@/shared/password-reset/storage';
type Ctx={params:Promise<{institutionId:string;membershipId?:string}>};
type Member=typeof institutionMemberships.$inferSelect;
type Actor=NonNullable<Awaited<ReturnType<typeof authorizeCapability>>>;
const ok=(data:unknown,status=200)=>NextResponse.json({data},{status,headers:{'Cache-Control':'no-store'}});
const profile=(row:Member)=>({displayName:row.displayName,institutionalCode:row.institutionalCode,institutionalEmail:row.institutionalEmail});
const snapshot=(row:Member)=>({...profile(row),status:row.status,deletedAt:row.deletedAt?.toISOString()??null});
function actions(actor:Actor,row:Member,grants:Awaited<ReturnType<typeof targetGrants>>,lastAdmin:boolean){
 const now=new Date(),allowed=row.userId!==actor.identity.id&&canManageTarget(actor.subject,grants,row.institutionId,now)&&privilegedAssuranceAllows(actor.access.grants,actor.identity,now,true);
 const permits=(capability:Capability)=>allowed&&can(actor.subject,capability,{institutionId:row.institutionId,status:capability==='users.restore'?'suspended':'active'},now);
 return {canEdit:!row.deletedAt&&permits('users.update'),canSuspend:row.status==='active'&&!row.deletedAt&&!lastAdmin&&permits('users.suspend'),canActivate:row.status==='suspended'&&!row.deletedAt&&permits('users.restore'),canDelete:!row.deletedAt&&!lastAdmin&&permits('users.suspend'),canRehabilitate:!!row.deletedAt&&permits('users.restore'),canRequestReset:!row.deletedAt&&permits('users.reset')};
}
async function dto(actor:Actor,row:Member,identity:{username:string;firstName:string;lastName:string},grants:Awaited<ReturnType<typeof targetGrants>>){
 const administrators=administratorState(grants),lastAdmin=administrators.any&&!await db.transaction(tx=>anotherActiveAdministrator(tx,row.institutionId,row.id,new Date(),administrators.permanent));
 return {id:row.id,status:row.status,userId:row.userId,username:identity.username,firstName:identity.firstName,lastName:identity.lastName,profile:profile(row),deletedAt:row.deletedAt,createdAt:row.createdAt,grants:grants.filter(grant=>!grant.revokedAt&&(!grant.validUntil||grant.validUntil>new Date())).map(grant=>({id:grant.id,role:grant.role,scopeType:grant.scopeType,scopeId:grant.scopeId,expiresAt:grant.validUntil})),actions:actions(actor,row,grants,lastAdmin)};
}
async function params(ctx:Ctx,detail=false){const p=await ctx.params;return uuid.safeParse(p.institutionId).success&&(!detail||uuid.safeParse(p.membershipId).success)?p:null;}
export const listUsers=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const p=await params(ctx);if(!p)return jsonError('INVALID_ID',400);
 const actor=await authorizeCapability(p.institutionId,'users.read');if(!actor)return jsonError('FORBIDDEN',403);
 const filter=membershipFilters(req.nextUrl.searchParams);if(!filter)return jsonError('INVALID_PAGE',400);
 const scope='memberships:'+p.institutionId+':'+createHash('sha256').update(JSON.stringify(filter)).digest('hex'),pageUrl=new URL(req.url);
 for(const key of ['q','status','role'])pageUrl.searchParams.delete(key);
 const page=parsePage(new NextRequest(pageUrl),scope);if(!page)return jsonError('INVALID_PAGE',400);
 const visibility=institutionVisibility(actor.subject,actor.access,actor.identity.sessionId,'users.read');
 const roleFilter=filter.role?exists(db.select({one:sql`1`}).from(roleAssignments).where(and(eq(roleAssignments.membershipId,institutionMemberships.id),eq(roleAssignments.role,filter.role as typeof roleAssignments.$inferSelect.role),liveGrant(new Date())))):undefined;
 const search=filter.q?'%'+escapeLike(filter.q)+'%':null;
 const rows=await db.select({member:institutionMemberships,username:platformUsers.username,firstName:people.firstName,lastName:people.lastName,cursorAt:cursorTimestamp(institutionMemberships.createdAt)}).from(institutionMemberships).innerJoin(platformUsers,eq(institutionMemberships.userId,platformUsers.id)).innerJoin(people,eq(platformUsers.personId,people.id)).where(and(eq(institutionMemberships.institutionId,p.institutionId),visibility,filter.status==='deleted'?isNotNull(institutionMemberships.deletedAt):filter.status!=='all'?and(isNull(institutionMemberships.deletedAt),eq(institutionMemberships.status,filter.status as 'active'|'suspended')):undefined,roleFilter,search?or(ilike(platformUsers.username,search),ilike(people.firstName,search),ilike(people.lastName,search),ilike(institutionMemberships.displayName,search),ilike(institutionMemberships.institutionalCode,search),ilike(institutionMemberships.institutionalEmail,search)):undefined,cursorPredicate(page,institutionMemberships.createdAt,institutionMemberships.id))).orderBy(desc(institutionMemberships.createdAt),desc(institutionMemberships.id)).limit(page.limit+1);
 const envelope=pageEnvelope(rows.map(row=>({...row,id:row.member.id})),page,scope);
 const grants=rows.length?await db.select().from(roleAssignments).where(and(inArray(roleAssignments.membershipId,rows.map(row=>row.member.id)),visibility)):[];
 const data=await Promise.all(envelope.visible.map(row=>dto(actor,row.member,row,grants.filter(grant=>grant.membershipId===row.member.id).map(grant=>storedGrant(grant,p.institutionId)))));
 if(!(await db.select({id:institutionMemberships.id}).from(institutionMemberships).where(and(eq(institutionMemberships.id,actor.access.membershipId),visibility)).limit(1)).length)return NextResponse.json({data:[],page:{nextCursor:null}},{headers:{'Cache-Control':'no-store'}});
 return NextResponse.json({data,page:envelope.page},{headers:{'Cache-Control':'no-store'}});
});
export const userDetail=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const p=await params(ctx,true);if(!p)return jsonError('INVALID_ID',400);
 const actor=await authorizeCapability(p.institutionId,'users.read');if(!actor)return jsonError('FORBIDDEN',403);
 const visibility=institutionVisibility(actor.subject,actor.access,actor.identity.sessionId,'users.read');
 const [row]=await db.select({member:institutionMemberships,username:platformUsers.username,firstName:people.firstName,lastName:people.lastName}).from(institutionMemberships).innerJoin(platformUsers,eq(institutionMemberships.userId,platformUsers.id)).innerJoin(people,eq(platformUsers.personId,people.id)).where(and(eq(institutionMemberships.id,p.membershipId!),eq(institutionMemberships.institutionId,p.institutionId),visibility)).limit(1);
 if(!row)return jsonError('MEMBERSHIP_NOT_FOUND',404);
 const grants=(await db.select().from(roleAssignments).where(and(eq(roleAssignments.membershipId,row.member.id),visibility))).map(grant=>storedGrant(grant,p.institutionId));
 const data=await dto(actor,row.member,row,grants);
 if(!(await db.select({id:institutionMemberships.id}).from(institutionMemberships).where(and(eq(institutionMemberships.id,actor.access.membershipId),visibility)).limit(1)).length)return jsonError('FORBIDDEN',403);
 return ok(data);
});
export const userHistory=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const p=await params(ctx,true);if(!p)return jsonError('INVALID_ID',400);
 const actor=await authorizeCapability(p.institutionId,'users.read');if(!actor)return jsonError('FORBIDDEN',403);
 const scope='membership-history:'+p.institutionId+':'+p.membershipId,page=parsePage(req,scope);if(!page)return jsonError('INVALID_PAGE',400);
 const visibility=institutionVisibility(actor.subject,actor.access,actor.identity.sessionId,'users.read');
 const [member]=await db.select({id:institutionMemberships.id}).from(institutionMemberships).where(and(eq(institutionMemberships.id,p.membershipId!),eq(institutionMemberships.institutionId,p.institutionId),visibility)).limit(1);if(!member)return jsonError('MEMBERSHIP_NOT_FOUND',404);
 const rows=await db.select({id:membershipEvents.id,action:membershipEvents.action,actorUserId:membershipEvents.actorUserId,reason:membershipEvents.reason,changes:membershipEvents.changes,createdAt:membershipEvents.createdAt,cursorAt:cursorTimestamp(membershipEvents.createdAt)}).from(membershipEvents).where(and(eq(membershipEvents.institutionId,p.institutionId),eq(membershipEvents.membershipId,p.membershipId!),visibility,cursorPredicate(page,membershipEvents.createdAt,membershipEvents.id))).orderBy(desc(membershipEvents.createdAt),desc(membershipEvents.id)).limit(page.limit+1);
 const envelope=pageEnvelope(rows,page,scope);return NextResponse.json({data:envelope.visible.map(({cursorAt:_at,changes,...row})=>({...row,changes:projectUserHistory(changes)})),page:envelope.page},{headers:{'Cache-Control':'no-store'}});
});
export async function event(tx:Transaction,actorId:string,row:Member,action:string,reason:string,changes:Record<string,unknown>,requestId:string){
 const projected=projectUserHistory(changes);await tx.insert(membershipEvents).values({institutionId:row.institutionId,membershipId:row.id,actorUserId:actorId,action,reason,changes:projected});
 await audit(tx,{actorUserId:actorId,institutionId:row.institutionId,action:'membership.'+action,target:'membership:'+row.id,requestId,details:{...projected,reason}});
}
export const updateProfile=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);const p=await params(ctx,true);if(!p)return jsonError('INVALID_ID',400);
 const input=profileBody.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const actor=await authorizeCapability(p.institutionId,'users.update',{institutionId:p.institutionId,status:'active'},true);if(!actor)return jsonError('FORBIDDEN',403);
 try{const result=await db.transaction(async tx=>{
  const [hint]=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.id,p.membershipId!),eq(institutionMemberships.institutionId,p.institutionId)));if(!hint)return null;
  if(hint.userId===actor.identity.id)return null;
  const current=await lockWriteCapability(tx,actor.identity,actor.access,'users.update',{institutionId:p.institutionId,status:'active'},hint,true);if(!current||current.targetMember?.deletedAt||!canManageTarget(current.subject,await targetGrants(tx,hint.id,p.institutionId),p.institutionId,new Date()))return null;
  const before=current.targetMember!,{reason,...changes}=input.data;
  const [after]=await tx.update(institutionMemberships).set({...changes,updatedAt:new Date()}).where(eq(institutionMemberships.id,hint.id)).returning();await event(tx,actor.identity.id,after,'profile',reason,{before:snapshot(before),after:snapshot(after)},context(req).requestId);return {id:after.id,profile:profile(after)};
 });return result?ok(result):jsonError('FORBIDDEN',403);}catch(error){if(((error as {cause?:{code?:string};code?:string}).code??(error as {cause?:{code?:string}}).cause?.code)==='23505')return jsonError('INSTITUTIONAL_CODE_EXISTS',409);throw error;}
});
export const changeLifecycle=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);const p=await params(ctx,true);if(!p)return jsonError('INVALID_ID',400);
 const input=lifecycleBody.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const restoring=['activate','rehabilitate'].includes(input.data.operation),capability=restoring?'users.restore':'users.suspend',resource={institutionId:p.institutionId,status:restoring?'suspended':'active'};
 const actor=await authorizeCapability(p.institutionId,capability,resource,true);if(!actor)return jsonError('FORBIDDEN',403);
 const result=await db.transaction(async tx=>{
  const [hint]=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.id,p.membershipId!),eq(institutionMemberships.institutionId,p.institutionId)));if(!hint)return {error:'MEMBERSHIP_NOT_FOUND',status:404};if(hint.userId===actor.identity.id)return {error:'SELF_CHANGE_DENIED',status:403};
  const current=await lockWriteCapability(tx,actor.identity,actor.access,capability,resource,hint,true);if(!current)return {error:'FORBIDDEN',status:403};
  const before=current.targetMember!,now=new Date(),grants=await targetGrants(tx,hint.id,p.institutionId);if(!canManageTarget(current.subject,grants,p.institutionId,now))return {error:'TARGET_ROLE_PROTECTED',status:403};
  const transition=lifecycleTransition(before,input.data.operation,now);if(!transition)return {error:'INVALID_LIFECYCLE_TRANSITION',status:409};const administrators=administratorState(grants,now);
  if(!restoring&&administrators.any&&!await anotherActiveAdministrator(tx,p.institutionId,hint.id,now,administrators.permanent))return {error:'LAST_ADMIN_REQUIRED',status:409};
  const [after]=await tx.update(institutionMemberships).set({status:transition.status,deletedAt:transition.deletedAt,updatedAt:now}).where(eq(institutionMemberships.id,hint.id)).returning();
  let revokedGrants=0;
  if(transition.dropGrants){revokedGrants=(await tx.update(roleAssignments).set({revokedAt:now}).where(and(eq(roleAssignments.membershipId,hint.id),isNull(roleAssignments.revokedAt))).returning({id:roleAssignments.id})).length;
   const invitations=await tx.update(institutionInvitations).set({state:'revoked',consumedAt:now,updatedAt:now}).where(and(eq(institutionInvitations.institutionId,p.institutionId),eq(institutionInvitations.createdBy,hint.userId),eq(institutionInvitations.state,'pending'))).returning({id:institutionInvitations.id});
   if(invitations.length)await tx.update(invitationDeliveryOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(inArray(invitationDeliveryOutbox.invitationId,invitations.map(row=>row.id)),eq(invitationDeliveryOutbox.state,'queued')));
  }
  await invalidatePrivileges(tx,hint.userId,now);await event(tx,actor.identity.id,after,input.data.operation,input.data.reason,{before:snapshot(before),after:{...snapshot(after),revokedGrants}},context(req).requestId);
  return {data:{id:after.id,status:after.status,deletedAt:after.deletedAt,revokedGrants}};
 });return 'error'in result?jsonError(result.error!,result.status!):ok(result.data);
});
export const requestUserReset=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);const p=await params(ctx,true);if(!p)return jsonError('INVALID_ID',400);
 const input=z.object({reason}).strict().safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const actor=await authorizeCapability(p.institutionId,'users.reset',{institutionId:p.institutionId,status:'active'},true);if(!actor)return jsonError('FORBIDDEN',403);
 const result=await db.transaction(async tx=>{
  const [hint]=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.id,p.membershipId!),eq(institutionMemberships.institutionId,p.institutionId)));if(!hint||hint.userId===actor.identity.id)return false;
  const current=await lockWriteCapability(tx,actor.identity,actor.access,'users.reset',{institutionId:p.institutionId,status:'active'},hint,true);if(!current||current.targetMember?.deletedAt||!canManageTarget(current.subject,await targetGrants(tx,hint.id,p.institutionId),p.institutionId,new Date()))return false;
  await issuePasswordReset(tx,hint.userId,context(req).requestId);await event(tx,actor.identity.id,current.targetMember!,'password-reset-request',input.data.reason,{},context(req).requestId);return true;
 });return result?ok({requested:true},202):jsonError('FORBIDDEN',403);
});
