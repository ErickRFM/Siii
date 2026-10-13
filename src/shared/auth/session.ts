import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { authSessions, platformUsers, people, institutionMemberships, institutions, roleAssignments } from '../../../db/schema';
import type { Role, Permission } from './roles';
import { hasPermission } from './roles';

export const SESSION_COOKIE = 'siii_session';
export const SESSION_DAYS = 7;
export const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const generateToken = () => randomBytes(32).toString('base64url');

export async function getIdentity() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const rows = await db.select({
    sessionId:authSessions.id, id:platformUsers.id, username:platformUsers.username,
    firstName:people.firstName,lastName:people.lastName, mustChangePassword:platformUsers.mustChangePassword,
  }).from(authSessions)
    .innerJoin(platformUsers, eq(authSessions.userId, platformUsers.id))
    .innerJoin(people,eq(platformUsers.personId,people.id))
    .where(and(eq(authSessions.tokenHash,digestToken(raw)),gt(authSessions.expiresAt,new Date()),isNull(authSessions.revokedAt),eq(platformUsers.isActive,true)))
    .limit(1);
  return rows[0] ?? null;
}
export async function getInstitutionAccess(userId:string) {
  const rows=await db.select({institutionId:institutions.id,institutionName:institutions.name,institutionCode:institutions.code,
    membershipId:institutionMemberships.id,role:roleAssignments.role})
    .from(institutionMemberships)
    .innerJoin(institutions,eq(institutionMemberships.institutionId,institutions.id))
    .innerJoin(roleAssignments,eq(roleAssignments.membershipId,institutionMemberships.id))
    .where(and(eq(institutionMemberships.userId,userId),eq(institutionMemberships.status,'active'),eq(institutions.status,'active'),isNull(roleAssignments.revokedAt)));
  const grouped=new Map<string,{institutionId:string;institutionName:string;institutionCode:string;membershipId:string;roles:Role[]}>();
  for(const r of rows){let v=grouped.get(r.institutionId);if(!v){v={institutionId:r.institutionId,institutionName:r.institutionName,institutionCode:r.institutionCode,membershipId:r.membershipId,roles:[]};grouped.set(r.institutionId,v)}v.roles.push(r.role)}
  return [...grouped.values()];
}
export async function authorizeInstitution(institutionId:string,permission:Permission) {
  const identity=await getIdentity();
  if(!identity || identity.mustChangePassword) return null;
  const memberships=await getInstitutionAccess(identity.id);
  const access=memberships.find(x=>x.institutionId===institutionId);
  if(!access || !hasPermission(access.roles,permission)) return null;
  return {identity,access};
}
