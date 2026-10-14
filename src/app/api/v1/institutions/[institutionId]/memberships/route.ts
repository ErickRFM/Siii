import {NextRequest,NextResponse} from 'next/server';
import {and,eq,desc} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutionMemberships,platformUsers,people} from '../../../../../../../db/schema';
import {authorizeInstitution} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {uuid,membershipCreateBody} from '@/shared/auth/validation';
import {lockWriteAccess} from '@/shared/auth/write-access';
import {context,audit} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {parsePage,pageEnvelope,cursorTimestamp,cursorPredicate} from '@/shared/http/pagination';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
export const GET=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 if(!await authorizeInstitution(institutionId,'users.read'))return jsonError('FORBIDDEN',403);
 const scope='memberships:'+institutionId,pageInput=parsePage(req,scope);if(!pageInput)return jsonError('INVALID_PAGE',400);
 const rows=await db.select({id:institutionMemberships.id,status:institutionMemberships.status,userId:platformUsers.id,username:platformUsers.username,firstName:people.firstName,lastName:people.lastName,cursorAt:cursorTimestamp(institutionMemberships.createdAt)})
  .from(institutionMemberships).innerJoin(platformUsers,eq(institutionMemberships.userId,platformUsers.id)).innerJoin(people,eq(platformUsers.personId,people.id))
  .where(and(eq(institutionMemberships.institutionId,institutionId),cursorPredicate(pageInput,institutionMemberships.createdAt,institutionMemberships.id)))
  .orderBy(desc(institutionMemberships.createdAt),desc(institutionMemberships.id)).limit(pageInput.limit+1);
 const {visible,page}=pageEnvelope(rows,pageInput,scope);
 return NextResponse.json({data:visible.map(row=>({id:row.id,status:row.status,userId:row.userId,username:row.username,firstName:row.firstName,lastName:row.lastName})),page},{headers:{'Cache-Control':'no-store'}});
});
export const POST=withErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await ctx.params;if(!uuid.safeParse(institutionId).success)return jsonError('INVALID_ID',400);
 const access=await authorizeInstitution(institutionId,'users.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=membershipCreateBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const {requestId}=context(req);
 const result=await db.transaction(async tx=>{
  if(!await lockWriteAccess(tx,access.identity,access.access,'users.manage'))return {error:'FORBIDDEN',status:403} as const;
  const [user]=await tx.select({id:platformUsers.id}).from(platformUsers).where(and(eq(platformUsers.id,parsed.data.userId),eq(platformUsers.isActive,true))).limit(1);
  if(!user)return {error:'USER_NOT_FOUND',status:404} as const;
  const [row]=await tx.insert(institutionMemberships).values({institutionId,userId:user.id}).onConflictDoNothing().returning({id:institutionMemberships.id,status:institutionMemberships.status});
  if(!row)return {error:'MEMBERSHIP_EXISTS',status:409} as const;
  await audit(tx,{actorUserId:access.identity.id,institutionId,action:'membership.create',target:'user:'+user.id,requestId,details:{after:{id:row.id,userId:user.id,status:row.status}}});
  return {data:{id:row.id}} as const;
 });
 if('error'in result&&result.error)return jsonError(result.error,result.status??500);
 return NextResponse.json(result,{status:201,headers:{'Cache-Control':'no-store'}});
});
