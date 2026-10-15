import {NextRequest,NextResponse} from 'next/server';
import {and,eq,desc,inArray} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutionMemberships,platformUsers,people,roleAssignments} from '../../../../../../../db/schema';
import {authorizeCapability} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {uuid,membershipCreateBody} from '@/shared/auth/validation';
import {liveGrant,storedGrant} from '@/shared/auth/institution-policy';
import {institutionVisibility} from '@/shared/auth/read-access';

import {withErrors} from '@/shared/http/route-errors';
import {parsePage,pageEnvelope,cursorTimestamp,cursorPredicate} from '@/shared/http/pagination';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
export const GET=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const actor=await authorizeCapability(institutionId,'users.read');if(!actor)return jsonError('FORBIDDEN',403);
 const visibility=institutionVisibility(actor.subject,actor.access,actor.identity.sessionId,'users.read');
 const scope='memberships:'+institutionId,pageInput=parsePage(req,scope);if(!pageInput)return jsonError('INVALID_PAGE',400);
 const rows=await db.select({id:institutionMemberships.id,status:institutionMemberships.status,userId:platformUsers.id,username:platformUsers.username,firstName:people.firstName,lastName:people.lastName,cursorAt:cursorTimestamp(institutionMemberships.createdAt)})
  .from(institutionMemberships).innerJoin(platformUsers,eq(institutionMemberships.userId,platformUsers.id)).innerJoin(people,eq(platformUsers.personId,people.id))
  .where(and(eq(institutionMemberships.institutionId,institutionId),visibility,cursorPredicate(pageInput,institutionMemberships.createdAt,institutionMemberships.id)))
  .orderBy(desc(institutionMemberships.createdAt),desc(institutionMemberships.id)).limit(pageInput.limit+1);
 const {visible,page}=pageEnvelope(rows,pageInput,scope);
 const grants=visible.length?await db.select().from(roleAssignments).where(and(inArray(roleAssignments.membershipId,visible.map(row=>row.id)),liveGrant(new Date()),visibility)):[];
 return NextResponse.json({data:visible.map(row=>({id:row.id,status:row.status,userId:row.userId,username:row.username,firstName:row.firstName,lastName:row.lastName,grants:grants.filter(grant=>grant.membershipId===row.id).map(grant=>{const normalized=storedGrant(grant,institutionId);return {id:grant.id,role:grant.role,scopeType:normalized.scopeType,scopeId:normalized.scopeId,expiresAt:grant.expiresAt};})})),page},{headers:{'Cache-Control':'no-store'}});
});
export const POST=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const access=await authorizeCapability(institutionId,'memberships.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=membershipCreateBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 return jsonError('INVITATION_REQUIRED',409);
});
