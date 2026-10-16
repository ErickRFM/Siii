import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {and,eq,desc} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutionInvitations,invitationDeliveryOutbox,roleAssignments,academicPrograms,campuses} from '../../../db/schema';
import {authorizeCapability,institutionContext} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {uuid} from '@/shared/auth/validation';
import {can,canGrant} from '@/shared/auth/capabilities';
import {hasFreshStepUp} from '@/shared/auth/mfa-session-policy';
import {privilegedAssuranceAllows} from '@/shared/auth/privileged-policy';
import {lockWriteCapability} from '@/shared/auth/write-access';
import {lockScope} from '@/shared/auth/privilege-write';
import {storedGrant} from '@/shared/auth/institution-policy';
import {institutionVisibility} from '@/shared/auth/read-access';
import {audit,context} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {cursorPredicate,cursorTimestamp,pageEnvelope,parsePage} from '@/shared/http/pagination';
import {createInvitationBody} from './validation';
import {newInvitationToken,hashInvitationToken} from './token';
import {usableInvitation} from './state-policy';
import {budget,queue,cancelQueued,rotate,invitationDto,invitationScope,invitationActions,deliveryState} from './storage';
type Ctx={params:Promise<{institutionId:string;invitationId?:string}>};
const response=(data:unknown,status=200)=>NextResponse.json({data},{status,headers:{'Cache-Control':'no-store'}});
async function issuerContext(institutionId:string){
 const actor=await institutionContext(institutionId),now=new Date();
 if(!actor||!can(actor.subject,'invitations.manage',{institutionId,status:'active'},now))return {error:jsonError('FORBIDDEN',403)};
 if(!privilegedAssuranceAllows(actor.access.grants,actor.identity,now)||!actor.identity.mfaConfigured||!actor.identity.mfaVerified)return {error:jsonError('MFA_REQUIRED',403)};
 if(!hasFreshStepUp(actor.identity,now))return {error:jsonError('STEP_UP_REQUIRED',403)};
 return {actor};
}
export function invitationErrors(handler:(req:NextRequest,ctx:Ctx)=>Promise<NextResponse>){
 return withErrors(async(req:NextRequest,ctx:Ctx)=>{try{return await handler(req,ctx);}catch(error){
  const code=error instanceof Error?error.message:'';
  if(['INVITATION_KEY_UNAVAILABLE','INVALID_PUBLIC_ORIGIN','INVITATION_DELIVERY_INVALID'].includes(code))return jsonError(code,503);
  throw error;
 }});
}
export const listInvitations=invitationErrors(async(req,ctx)=>{
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const actor=await authorizeCapability(institutionId,'invitations.manage');if(!actor)return jsonError('FORBIDDEN',403);
 const scope='invitations:'+institutionId,page=parsePage(req,scope);if(!page)return jsonError('INVALID_PAGE',400);
 const visibility=institutionVisibility(actor.subject,actor.access,actor.identity.sessionId,'invitations.manage');
 const rows=await db.select({invite:institutionInvitations,cursorAt:cursorTimestamp(institutionInvitations.createdAt),programStatus:academicPrograms.status,campusStatus:campuses.status}).from(institutionInvitations)
  .leftJoin(academicPrograms,and(eq(institutionInvitations.programId,academicPrograms.id),eq(institutionInvitations.institutionId,academicPrograms.institutionId)))
  .leftJoin(campuses,and(eq(institutionInvitations.campusId,campuses.id),eq(institutionInvitations.institutionId,campuses.institutionId)))
  .where(and(eq(institutionInvitations.institutionId,institutionId),visibility,cursorPredicate(page,institutionInvitations.createdAt,institutionInvitations.id))).orderBy(desc(institutionInvitations.createdAt),desc(institutionInvitations.id)).limit(page.limit+1);
 const envelope=pageEnvelope(rows.map(row=>({...row.invite,cursorAt:row.cursorAt})),page,scope);
 const data=await Promise.all(envelope.visible.map(async row=>{
  const [delivery]=await db.select({state:invitationDeliveryOutbox.state,failureCode:invitationDeliveryOutbox.failureCode}).from(invitationDeliveryOutbox).where(and(eq(invitationDeliveryOutbox.invitationId,row.id),visibility)).orderBy(desc(invitationDeliveryOutbox.createdAt),desc(invitationDeliveryOutbox.id)).limit(1);
  const parent=rows.find(source=>source.invite.id===row.id);
  return invitationDto(row,delivery,invitationActions(row,actor.subject,actor.access.grants,actor.identity.id,row.scopeType==='institution'||(row.scopeType==='program'?parent?.programStatus:parent?.campusStatus)==='active'));
 }));
 return NextResponse.json({data,page:envelope.page},{headers:{'Cache-Control':'no-store'}});
});
export const createInvitation=invitationErrors(async(req,ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const authorization=await issuerContext(institutionId);if(authorization.error)return authorization.error;const actor=authorization.actor!;
 const parsed=createInvitationBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const input=parsed.data,{requestId}=context(req);
 const result=await db.transaction(async tx=>{
  if(!await budget(tx,'invitation_sender',institutionId+':'+actor.identity.id,new Date()))return {error:'RATE_LIMITED',status:429};
  const current=await lockWriteCapability(tx,actor.identity,actor.access,'invitations.manage',{institutionId,status:'active'},undefined,true);
  if(!current)return {error:'FORBIDDEN',status:403};
  const scope={institutionId,scopeType:input.scopeType,scopeId:input.scopeId},grantExpiresAt=input.grantExpiresAt?new Date(input.grantExpiresAt):null;
  if(!await lockScope(tx,scope))return {error:'INVALID_SCOPE',status:422};
  const now=new Date(),issuer=current.access.grants.filter(grant=>can({...current.subject,grants:[grant]},'invitations.manage',{institutionId,status:'active'},now)&&canGrant({...current.subject,grants:[grant]},input.role,scope,now,grantExpiresAt)).sort((a,b)=>(b.validUntil?.getTime()??Infinity)-(a.validUntil?.getTime()??Infinity))[0];
  if(!issuer)return {error:'ROLE_GRANT_DENIED',status:403};
  const max=Math.min(now.getTime()+7*86400000,issuer.validUntil?.getTime()??Infinity,grantExpiresAt?.getTime()??Infinity),expiresAt=input.expiresAt?new Date(input.expiresAt):new Date(max);
  if(expiresAt<=now||expiresAt.getTime()>max)return {error:'INVALID_EXPIRY',status:422};
  const id=randomUUID(),token=newInvitationToken();
  const [row]=await tx.insert(institutionInvitations).values({id,institutionId,email:input.email,role:input.role,scopeType:input.scopeType,programId:input.scopeType==='program'?input.scopeId:null,campusId:input.scopeType==='campus'?input.scopeId:null,grantExpiresAt,issuerMembershipId:current.access.membershipId,issuerGrantId:issuer.id,createdBy:actor.identity.id,tokenHash:hashInvitationToken(token,id,institutionId),expiresAt,createdAt:now,updatedAt:now,resendWindowAt:now,lastRequestedAt:now}).returning();
  const delivery=await queue(tx,row,token,now);
  await audit(tx,{actorUserId:actor.identity.id,institutionId,action:'invitation.create',target:'invitation:'+id,requestId,details:{after:{id,role:row.role,...scope,expiresAt,grantExpiresAt}}});
  return {data:invitationDto(row,delivery,invitationActions(row,current.subject,current.access.grants,actor.identity.id))};
 });
 return 'error'in result?jsonError(result.error!,result.status!):response(result.data,201);
});
export function manageInvitation(operation:'revoke'|'resend'){
 return invitationErrors(async(req,ctx)=>{
  if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
  const {institutionId,invitationId}=await ctx.params;if(!uuid.safeParse(institutionId).success||!uuid.safeParse(invitationId).success)return jsonError('INVALID_ID',400);
  const authorization=await issuerContext(institutionId);if(authorization.error)return authorization.error;const actor=authorization.actor!;
  const body=await req.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return jsonError('VALIDATION_ERROR',422);
  const {requestId}=context(req);
  const result=await db.transaction(async tx=>{
   if(!await budget(tx,'invitation_sender',institutionId+':'+actor.identity.id,new Date()))return {error:'RATE_LIMITED',status:429};
   const current=await lockWriteCapability(tx,actor.identity,actor.access,'invitations.manage',{institutionId,status:'active'},undefined,true);if(!current)return {error:'FORBIDDEN',status:403};
   const [row]=await tx.select().from(institutionInvitations).where(and(eq(institutionInvitations.id,invitationId!),eq(institutionInvitations.institutionId,institutionId))).for('update');
   const now=new Date();if(!row||!usableInvitation(row,now))return {error:'INVITATION_UNAVAILABLE',status:404};
   if(operation==='resend'){
    const [original]=await tx.select().from(roleAssignments).where(eq(roleAssignments.id,row.issuerGrantId));
    if(!original||row.createdBy!==actor.identity.id||!canGrant({...current.subject,grants:[storedGrant(original,institutionId)]},row.role,invitationScope(row),now,row.grantExpiresAt))return {error:'FORBIDDEN',status:403};
    if(row.lastRequestedAt.getTime()+60000>now.getTime()||(row.resendWindowAt.getTime()+3600000>now.getTime()&&row.resendCount>=3))return {error:'RATE_LIMITED',status:429};
    if(!await lockScope(tx,invitationScope(row)))return {error:'INVALID_SCOPE',status:422};
    const updated=await rotate(tx,row,now);await audit(tx,{actorUserId:actor.identity.id,institutionId,action:'invitation.resend',target:'invitation:'+row.id,requestId,details:{after:{state:'pending'}}});
    return {data:invitationDto(updated,await deliveryState(tx,row.id),invitationActions(updated,current.subject,current.access.grants,actor.identity.id))};
   }
   const [updated]=await tx.update(institutionInvitations).set({state:'revoked',consumedAt:now,updatedAt:now}).where(eq(institutionInvitations.id,row.id)).returning();
   await cancelQueued(tx,row.id,now);await audit(tx,{actorUserId:actor.identity.id,institutionId,action:'invitation.revoke',target:'invitation:'+row.id,requestId,details:{before:{state:'pending'},after:{state:'revoked'}}});
   return {data:invitationDto(updated,await deliveryState(tx,row.id))};
  });
  return 'error'in result?jsonError(result.error!,result.status!):response(result.data);
 });
}
