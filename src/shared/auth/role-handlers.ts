import {NextRequest,NextResponse} from 'next/server';
import {and,eq,isNull} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutionMemberships,roleAssignments} from '../../../db/schema';
import {institutionContext} from './session';
import {assertSameOrigin,jsonError} from './guards';
import {uuid,roleBody,revokeRoleBody} from './validation';
import {can,canGrant,canRevoke,canManageTarget,administratorState,type GrantScope} from './capabilities';
import {lockWriteCapability} from './write-access';
import {invalidatePrivileges,targetGrants,lockScope} from './privilege-write';
import {anotherActiveAdministrator} from './institution-policy';
import {privilegedAssuranceAllows} from './privileged-policy';
import {hasFreshStepUp} from './mfa-session-policy';
import {context,audit} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';

type Ctx={params:Promise<{institutionId:string}>};
async function actorContext(institutionId:string){
 const actor=await institutionContext(institutionId);
 if(!actor||!can(actor.subject,'roles.assign',{institutionId,status:'active'}))return {error:jsonError('FORBIDDEN',403)} as const;
 if(!privilegedAssuranceAllows(actor.access.grants,actor.identity,new Date(),false)||!actor.identity.mfaConfigured||!actor.identity.mfaVerified)return {error:jsonError('MFA_REQUIRED',403)} as const;
 if(!hasFreshStepUp(actor.identity,new Date()))return {error:jsonError('STEP_UP_REQUIRED',403)} as const;
 return {actor} as const;
}
export const assignRole=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const authorization=await actorContext(institutionId);if('error'in authorization)return authorization.error;
 const actor=authorization.actor;
 const parsed=roleBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const {membershipId,role,scopeType,scopeId}=parsed.data;
 const expiresAt=parsed.data.expiresAt?new Date(parsed.data.expiresAt):null,{requestId}=context(req);
 const result=await db.transaction(async tx=>{
  const [target]=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.id,membershipId),eq(institutionMemberships.institutionId,institutionId))).limit(1);
  if(!target||target.userId===actor.identity.id)return {error:'INVALID_TARGET',status:403} as const;
  const current=await lockWriteCapability(tx,actor.identity,actor.access,'roles.assign',{institutionId,status:'active'},target,true);
  if(!current||!current.targetUser?.isActive||current.targetMember?.status!=='active')return {error:'FORBIDDEN',status:403} as const;
  const scope:GrantScope={institutionId,scopeType,scopeId};
  if(!await lockScope(tx,scope))return {error:'INVALID_SCOPE',status:422} as const;
  const before=await targetGrants(tx,membershipId,institutionId);
  const now=new Date();
  if(!privilegedAssuranceAllows(current.access.grants,current.assurance,now,true))return {error:'STEP_UP_REQUIRED',status:403} as const;
  if(!canManageTarget(current.subject,before,institutionId,now))return {error:'TARGET_ROLE_PROTECTED',status:403} as const;
  if(!canGrant(current.subject,role,scope,now,expiresAt)){
   const someLifetime=current.subject.grants.some(grant=>canGrant({...current.subject,grants:[grant]},role,scope,now,grant.validUntil));
   return {error:someLifetime?'GRANT_EXPIRY_DENIED':'ROLE_GRANT_DENIED',status:403} as const;
  }
  const sameScope=before.filter(grant=>grant.role===role&&grant.scopeType===scopeType&&grant.scopeId===scopeId&&grant.revokedAt===null);
  if(sameScope.some(grant=>grant.validUntil===null||grant.validUntil>now))return {error:'ALREADY_ASSIGNED',status:409} as const;
  // Expiry is enforced at read time. Supersede an expired slot without waiting for cleanup.
  if(sameScope.length)await tx.update(roleAssignments).set({revokedAt:now}).where(and(eq(roleAssignments.membershipId,membershipId),eq(roleAssignments.role,role),isNull(roleAssignments.revokedAt),scopeType==='program'?eq(roleAssignments.programId,scopeId!):scopeType==='campus'?eq(roleAssignments.campusId,scopeId!):eq(roleAssignments.scopeType,'institution')));
  const [row]=await tx.insert(roleAssignments).values({membershipId,institutionId,role,scopeType,programId:scopeType==='program'?scopeId:null,campusId:scopeType==='campus'?scopeId:null,expiresAt,grantedBy:actor.identity.id}).returning({id:roleAssignments.id});
  const invalidation=await invalidatePrivileges(tx,target.userId,now);
  await audit(tx,{actorUserId:actor.identity.id,institutionId,action:'role.assign',target:'grant:'+row.id,requestId,details:{before:{grants:before},after:{id:row.id,membershipId,role,scopeType,scopeId,expiresAt,...invalidation}}});
  return {data:row} as const;
 });
 if('error'in result&&result.error)return jsonError(result.error,result.status);
 return NextResponse.json(result,{status:201,headers:{'Cache-Control':'no-store'}});
});
export const revokeRole=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const authorization=await actorContext(institutionId);if('error'in authorization)return authorization.error;
 const actor=authorization.actor;
 const parsed=revokeRoleBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const input=parsed.data,{requestId}=context(req);
 const result=await db.transaction(async tx=>{
  const candidates=await tx.select({grant:roleAssignments,member:institutionMemberships}).from(roleAssignments)
   .innerJoin(institutionMemberships,eq(roleAssignments.membershipId,institutionMemberships.id))
   .where(and(eq(institutionMemberships.institutionId,institutionId),'grantId'in input?eq(roleAssignments.id,input.grantId):
    and(eq(roleAssignments.membershipId,input.membershipId),eq(roleAssignments.role,input.role),eq(roleAssignments.scopeType,input.scopeType),
     input.scopeType==='program'?eq(roleAssignments.programId,input.scopeId!):input.scopeType==='campus'?eq(roleAssignments.campusId,input.scopeId!):undefined),isNull(roleAssignments.revokedAt))).limit(1);
  const candidate=candidates[0];if(!candidate)return {error:'ROLE_NOT_ASSIGNED',status:404} as const;
  if(candidate.member.userId===actor.identity.id)return {error:'SELF_CHANGE_DENIED',status:403} as const;
  const current=await lockWriteCapability(tx,actor.identity,actor.access,'roles.assign',{institutionId,status:'active'},candidate.member,true);
  if(!current)return {error:'FORBIDDEN',status:403} as const;
  const before=await targetGrants(tx,candidate.member.id,institutionId),now=new Date();
  if(!privilegedAssuranceAllows(current.access.grants,current.assurance,now,true))return {error:'STEP_UP_REQUIRED',status:403} as const;
  const grant=before.find(row=>row.id===candidate.grant.id&&row.revokedAt===null);
  if(!grant)return {error:'ROLE_NOT_ASSIGNED',status:404} as const;
  if(!canManageTarget(current.subject,before,institutionId,now)||!canRevoke(current.subject,grant.role,grant,now))return {error:'ROLE_REVOKE_DENIED',status:403} as const;
  const administrators=administratorState([grant],now);
  if(administrators.any&&!await anotherActiveAdministrator(tx,institutionId,candidate.member.id,now,administrators.permanent))return {error:'LAST_ADMIN_REQUIRED',status:409} as const;
  const [removed]=await tx.update(roleAssignments).set({revokedAt:now}).where(and(eq(roleAssignments.id,grant.id),isNull(roleAssignments.revokedAt))).returning({id:roleAssignments.id});
  if(!removed)return {error:'ROLE_NOT_ASSIGNED',status:404} as const;
  const invalidation=await invalidatePrivileges(tx,candidate.member.userId,now);
  await audit(tx,{actorUserId:actor.identity.id,institutionId,action:'role.revoke',target:'grant:'+grant.id,requestId,details:{before:{grant},after:{revokedAt:now,...invalidation}}});
  return {data:{id:removed.id,revoked:true}} as const;
 });
 if('error'in result&&result.error)return jsonError(result.error,result.status);
 return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
});
