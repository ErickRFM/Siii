import {and,eq,isNull} from 'drizzle-orm';
import {platformUsers,mfaEnrollments,mfaChallenges,roleAssignments,academicPrograms,campuses} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import type {GrantScope} from './capabilities';
import {storedGrant} from './institution-policy';
import {revokeUserSessions} from './session-write';

export async function invalidatePrivileges(tx:Transaction,userId:string,now:Date){
 // Caller owns the user lock. Reject exhaustion rather than wrapping the checked auth_version.
 const [user]=await tx.select({authVersion:platformUsers.authVersion}).from(platformUsers).where(eq(platformUsers.id,userId));
 if(!user||user.authVersion>=2147483647)throw new Error('AUTH_VERSION_EXHAUSTED');
 await tx.update(platformUsers).set({authVersion:user.authVersion+1}).where(eq(platformUsers.id,userId));
 await tx.update(mfaEnrollments).set({consumedAt:now}).where(and(eq(mfaEnrollments.userId,userId),isNull(mfaEnrollments.consumedAt)));
 await tx.update(mfaChallenges).set({consumedAt:now}).where(and(eq(mfaChallenges.userId,userId),isNull(mfaChallenges.consumedAt)));
 const revoked=await revokeUserSessions(tx,userId,now);
 return {authVersion:user.authVersion+1,sessionRevocations:revoked.length};
}
export async function targetGrants(tx:Transaction,membershipId:string,institutionId:string){
 return (await tx.select().from(roleAssignments).where(eq(roleAssignments.membershipId,membershipId))).map(row=>storedGrant(row,institutionId));
}
export async function lockScope(tx:Transaction,scope:GrantScope){
 if(scope.scopeType==='institution')return scope.scopeId===null;
 if(!scope.scopeId)return false;
 const table=scope.scopeType==='program'?academicPrograms:campuses;
 const [row]=await tx.select({id:table.id}).from(table).where(and(eq(table.id,scope.scopeId),eq(table.institutionId,scope.institutionId),eq(table.status,'active'))).for('update');
 return !!row;
}
