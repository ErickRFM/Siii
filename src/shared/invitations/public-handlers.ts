import {NextRequest,NextResponse} from 'next/server';
import {and,eq,inArray,asc,sql} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutions,platformUsers,people,institutionMemberships,roleAssignments,authSessions,mfaFactors,accountEmailVerifications,academicPrograms,campuses,institutionInvitations} from '../../../db/schema';
import {getIdentity} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {hashPassword} from '@/shared/auth/password';
import {can,canGrant,canManageTarget,type Subject} from '@/shared/auth/capabilities';
import {storedGrant} from '@/shared/auth/institution-policy';
import {factorIsActive} from '@/shared/auth/mfa-session';
import {hasFreshStepUp,sessionIsCurrent} from '@/shared/auth/mfa-session-policy';
import {lockScope,invalidatePrivileges} from '@/shared/auth/privilege-write';
import {audit,context} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {candidate,recipientBudget,canonicalEmailLock,invitationScope,lockInvitation,cancelQueued,type Invitation} from './storage';
import {invitationTokenBody,invitationRejectBody,invitationConsentBody,canonicalEmail,canonicalUsername,EMAIL_TRIM_CHARACTERS} from './validation';
import {usableInvitation} from './state-policy';
import type {Transaction} from '@/shared/http/request-context';
const unavailable=(status=404)=>jsonError('INVITATION_UNAVAILABLE',status);
const ok=(data:unknown)=>NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
async function validIssuer(tx:Transaction,row:Invitation,users:(typeof platformUsers.$inferSelect)[],factors:(typeof mfaFactors.$inferSelect)[],now:Date){
 const issuer=users.find(user=>user.id===row.createdBy);if(!issuer?.isActive||issuer.mustChangePassword||!factorIsActive(factors.find(factor=>factor.userId===issuer.id)??null))return false;
 const [membership]=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.id,row.issuerMembershipId),eq(institutionMemberships.institutionId,row.institutionId),eq(institutionMemberships.userId,row.createdBy),eq(institutionMemberships.status,'active'))).for('update');
 if(!membership)return false;
 const [original]=await tx.select().from(roleAssignments).where(and(eq(roleAssignments.id,row.issuerGrantId),eq(roleAssignments.membershipId,membership.id)));
 if(!original)return false;
 const subject:Subject={id:issuer.id,active:issuer.isActive,mustChangePassword:issuer.mustChangePassword,grants:[storedGrant(original,row.institutionId)]};
 return can(subject,'invitations.manage',{institutionId:row.institutionId,status:'active'},now)&&canGrant(subject,row.role,invitationScope(row),now,row.grantExpiresAt);
}
export const previewInvitation=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {requestId}=context(req);if(!await recipientBudget(req,requestId))return jsonError('RATE_LIMITED',429);
 const parsed=invitationTokenBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return unavailable();
 const row=await candidate(parsed.data.invitationId,parsed.data.token);if(!row||!usableInvitation(row,new Date()))return unavailable();
 const data=await db.transaction(async tx=>{
  // Serialize disclosure with institutional mutations before reading live authority. The hint
  // above only routes the lock; its bearer/state/issuer snapshot never authorizes a response.
  const [institution]=await tx.select({id:institutions.id,name:institutions.name}).from(institutions).where(and(eq(institutions.id,row.institutionId),eq(institutions.status,'active'))).for('share');
  if(!institution)return null;
  const users=await tx.select().from(platformUsers).where(eq(platformUsers.id,row.createdBy)).for('share');
  const factors=await tx.select().from(mfaFactors).where(eq(mfaFactors.userId,row.createdBy)).for('share');
  if(!await validIssuer(tx,row,users,factors,new Date()))return null;
  let scopeName:string|null=null;
  if(row.scopeType!=='institution'){
   const table=row.scopeType==='program'?academicPrograms:campuses;
   const [scope]=await tx.select({name:table.name}).from(table).where(and(eq(table.id,invitationScope(row).scopeId!),eq(table.institutionId,row.institutionId),eq(table.status,'active'))).for('share');
   if(!scope)return null;scopeName=scope.name;
  }
  const current=await lockInvitation(tx,row,parsed.data.token),now=new Date();
  if(!current||!usableInvitation(current,now)||!await validIssuer(tx,current,users,factors,now))return null;
  return {invitationId:current.id,institutionName:institution.name,role:current.role,...invitationScope(current),scopeName,expiresAt:current.expiresAt,grantExpiresAt:current.grantExpiresAt};
 });
 return data?ok(data):unavailable();
});
export const acceptInvitation=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {requestId}=context(req);if(!await recipientBudget(req,requestId))return jsonError('RATE_LIMITED',429);
 // This input-only response does not depend on token, invitation or account existence.
 // Keep all bearer/issuer/ownership failures indistinguishable below.
 const parsed=invitationConsentBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const input=parsed.data,row=await candidate(input.invitationId,input.token);if(!row||!usableInvitation(row,new Date()))return unavailable();
 const identity=input.mode==='existing'?await getIdentity():null;
 if(input.mode==='existing'){
  if(!identity)return jsonError('UNAUTHENTICATED',401);
  if(identity.mustChangePassword)return jsonError('PASSWORD_CHANGE_REQUIRED',403);
  if(!hasFreshStepUp(identity,new Date()))return jsonError('STEP_UP_REQUIRED',403);
  if(identity.id===row.createdBy)return jsonError('SELF_CHANGE_DENIED',403);
 }
 // Expensive hashing occurs after token/IP gates and before any institution/user/database lock.
 const passwordHash=input.mode==='new'?await hashPassword(input.account.password):null;
 try{
  const result=await db.transaction(async tx=>{
   const [institution]=await tx.select({id:institutions.id}).from(institutions).where(and(eq(institutions.id,row.institutionId),eq(institutions.status,'active'))).for('update');
   if(!institution)return null;
   await canonicalEmailLock(tx,row.email);
   const ids=[...new Set([row.createdBy,...(identity?[identity.id]:[])])].sort();
   const users=await tx.select().from(platformUsers).where(inArray(platformUsers.id,ids)).orderBy(asc(platformUsers.id)).for('update');
   const factors=await tx.select().from(mfaFactors).where(inArray(mfaFactors.userId,ids)).orderBy(asc(mfaFactors.userId)).for('share');
   if(identity){
    const [session]=await tx.select().from(authSessions).where(and(eq(authSessions.id,identity.sessionId),eq(authSessions.userId,identity.id))).for('share');
    const own=users.find(user=>user.id===identity.id),now=new Date();
    if(!own||!session||!sessionIsCurrent(own,session,factors.find(factor=>factor.userId===own.id)??null,now))throw new Error('INVITATION_SESSION_UNAUTHENTICATED');
    if(own.mustChangePassword)throw new Error('INVITATION_PASSWORD_CHANGE_REQUIRED');
    if(!hasFreshStepUp(session,now))throw new Error('INVITATION_STEP_UP_REQUIRED');
   }
   if(!await validIssuer(tx,row,users,factors,new Date())||!await lockScope(tx,invitationScope(row)))return null;
   // Email ownership is global. Token + fresh own-account proof may establish it, never the issuer.
   const [verifiedOwner]=await tx.select().from(accountEmailVerifications).where(eq(accountEmailVerifications.verifiedEmail,row.email)).limit(1);
   if(verifiedOwner&&verifiedOwner.userId!==identity?.id)return null;
   const legacyOwners=await tx.select({userId:platformUsers.id,email:people.email}).from(platformUsers).innerJoin(people,eq(platformUsers.personId,people.id)).where(sql`lower(btrim(${people.email},${EMAIL_TRIM_CHARACTERS}))=${row.email}`);
   if(input.mode==='new'&&legacyOwners.length)return null;
   if(identity){
    const [ownVerified]=await tx.select().from(accountEmailVerifications).where(eq(accountEmailVerifications.userId,identity.id)).limit(1);
    if(ownVerified&&ownVerified.verifiedEmail!==row.email)return null;
    const own=users.find(user=>user.id===identity.id)!;
    const [person]=await tx.select({email:people.email}).from(people).where(eq(people.id,own.personId)).for('share');
    if(!person||(person.email!==null&&canonicalEmail(person.email)!==row.email))return null;
    if(legacyOwners.some(owner=>owner.userId!==identity.id))return null;
   }
   let targetUserId=identity?.id;
   if(input.mode==='new'){
    const [person]=await tx.insert(people).values({firstName:input.account.firstName,lastName:input.account.lastName,email:row.email}).returning({id:people.id});
    const [user]=await tx.insert(platformUsers).values({personId:person.id,username:canonicalUsername(input.account.username),passwordHash:passwordHash!,isActive:true,mustChangePassword:false}).returning({id:platformUsers.id});
    targetUserId=user.id;
   }
   if(!targetUserId)return null;
   const [existingMembership]=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.userId,targetUserId),eq(institutionMemberships.institutionId,row.institutionId))).for('update');
   if(existingMembership?.status==='suspended')return null;
   const membership=existingMembership??(await tx.insert(institutionMemberships).values({userId:targetUserId,institutionId:row.institutionId}).returning())[0];
   const current=await lockInvitation(tx,row,input.token);const now=new Date();
   if(!current||!usableInvitation(current,now)||!await validIssuer(tx,current,users,factors,now))throw new Error('INVITATION_CONSENT_ABORT');
   const targetAssignments=await tx.select().from(roleAssignments).where(eq(roleAssignments.membershipId,membership.id));
   const [originalGrant]=await tx.select().from(roleAssignments).where(eq(roleAssignments.id,current.issuerGrantId));
   const issuer=users.find(user=>user.id===current.createdBy)!;
   const originalSubject:Subject={id:issuer.id,active:issuer.isActive,mustChangePassword:issuer.mustChangePassword,grants:[storedGrant(originalGrant,current.institutionId)]};
   if(!canManageTarget(originalSubject,targetAssignments.map(grant=>storedGrant(grant,current.institutionId)),current.institutionId,now))throw new Error('INVITATION_CONSENT_ABORT');
   const assignments=await tx.select().from(roleAssignments).where(and(eq(roleAssignments.membershipId,membership.id),eq(roleAssignments.role,current.role),eq(roleAssignments.scopeType,current.scopeType),current.scopeType==='program'?eq(roleAssignments.programId,current.programId!):current.scopeType==='campus'?eq(roleAssignments.campusId,current.campusId!):undefined));
   const live=assignments.find(grant=>grant.revokedAt===null&&(grant.expiresAt===null||grant.expiresAt>now));
   // An invitation cannot silently replace an already active scope/role or widen its duration.
   if(live)throw new Error('INVITATION_CONSENT_ABORT');
   for(const expired of assignments.filter(grant=>grant.revokedAt===null))await tx.update(roleAssignments).set({revokedAt:now}).where(eq(roleAssignments.id,expired.id));
   await tx.insert(roleAssignments).values({membershipId:membership.id,institutionId:current.institutionId,role:current.role,scopeType:current.scopeType,programId:current.programId,campusId:current.campusId,expiresAt:current.grantExpiresAt,grantedBy:current.createdBy});
   await tx.update(institutionInvitations).set({state:'accepted',consumedAt:now,acceptedUserId:targetUserId,updatedAt:now}).where(eq(institutionInvitations.id,current.id));
   if(!verifiedOwner)await tx.insert(accountEmailVerifications).values({userId:targetUserId,verifiedEmail:current.email,proofInvitationId:current.id,verifiedAt:now});
   await cancelQueued(tx,current.id,now);
   const invalidation=await invalidatePrivileges(tx,targetUserId,now);
   await audit(tx,{actorUserId:targetUserId,institutionId:current.institutionId,action:'invitation.accept',target:'invitation:'+current.id,requestId,details:{before:{state:'pending'},after:{state:'accepted',membershipId:membership.id,...invalidation}}});
   return {state:'accepted',institutionId:current.institutionId,membershipId:membership.id,requiresLogin:true};
  });
  return result?ok(result):unavailable();
 }catch(error){
  if(error instanceof Error&&error.message==='INVITATION_SESSION_UNAUTHENTICATED')return jsonError('UNAUTHENTICATED',401);
  if(error instanceof Error&&error.message==='INVITATION_PASSWORD_CHANGE_REQUIRED')return jsonError('PASSWORD_CHANGE_REQUIRED',403);
  if(error instanceof Error&&error.message==='INVITATION_STEP_UP_REQUIRED')return jsonError('STEP_UP_REQUIRED',403);
  const code=(error as {code?:string;cause?:{code?:string}}).code??(error as {cause?:{code?:string}}).cause?.code;
  if((error instanceof Error&&error.message==='INVITATION_CONSENT_ABORT')||['23505','23503','23514'].includes(code??''))return unavailable();
  throw error;
 }
});
export const rejectInvitation=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {requestId}=context(req);if(!await recipientBudget(req,requestId))return jsonError('RATE_LIMITED',429);
 const parsed=invitationRejectBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return unavailable();
 const row=await candidate(parsed.data.invitationId,parsed.data.token);if(!row||!usableInvitation(row,new Date()))return unavailable();
 const result=await db.transaction(async tx=>{
  const [institution]=await tx.select({id:institutions.id}).from(institutions).where(and(eq(institutions.id,row.institutionId),eq(institutions.status,'active'))).for('update');if(!institution)return false;
  const current=await lockInvitation(tx,row,parsed.data.token);if(!current)return false;
  const now=new Date();await tx.update(institutionInvitations).set({state:'rejected',consumedAt:now,updatedAt:now}).where(eq(institutionInvitations.id,current.id));await cancelQueued(tx,current.id,now);
  await audit(tx,{institutionId:row.institutionId,action:'invitation.reject',target:'invitation:'+row.id,requestId,details:{before:{state:'pending'},after:{state:'rejected'}}});return true;
 });
 return result?ok({state:'rejected'}):unavailable();
});
