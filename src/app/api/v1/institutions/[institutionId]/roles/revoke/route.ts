import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionMemberships, roleAssignments, securityAuditLog } from '../../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { canGrantRole, canManageMembership } from '@/shared/auth/roles';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ institutionId: string }> };
const uuid = z.string().uuid();
const schema = z.object({
  membershipId: uuid,
  role: z.enum(['student', 'workshop_participant', 'teacher_pending',
    'teacher', 'tutor', 'coordinator', 'admin', 'super_admin']),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const { institutionId } = await ctx.params;
  if (!uuid.safeParse(institutionId).success) return jsonError('INVALID_ID', 400);

  const actor = await authorizeInstitution(institutionId, 'roles.assign');
  if (!actor) return jsonError('FORBIDDEN', 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError('VALIDATION_ERROR', 422);
  const { membershipId, role } = parsed.data;
  if (!canGrantRole(actor.access.roles, role)) return jsonError('ROLE_REVOKE_DENIED', 403);

  const membership = await db.select({ userId: institutionMemberships.userId })
    .from(institutionMemberships)
    .where(and(eq(institutionMemberships.id, membershipId),
      eq(institutionMemberships.institutionId, institutionId),
      eq(institutionMemberships.status, 'active'))).limit(1);

  if (!membership.length) return jsonError('MEMBERSHIP_NOT_FOUND', 404);
  if (membership[0].userId === actor.identity.id) return jsonError('SELF_CHANGE_DENIED', 403);

  const targetRoles = await db.select({ role: roleAssignments.role })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.membershipId, membershipId), isNull(roleAssignments.revokedAt)));
  if (!canManageMembership(actor.access.roles, targetRoles.map(r => r.role))) {
    return jsonError('TARGET_ROLE_PROTECTED', 403);
  }

  const rows = await db.transaction(async tx => {
    const removed = await tx.update(roleAssignments).set({ revokedAt: new Date() })
      .where(and(eq(roleAssignments.membershipId, membershipId),
        eq(roleAssignments.role, role), isNull(roleAssignments.revokedAt)))
      .returning({ id: roleAssignments.id });
    if (removed.length) {
      await tx.insert(securityAuditLog).values({
        actorUserId: actor.identity.id,
        institutionId,
        action: 'role.revoke',
        target: `membership:${membershipId}:role:${role}`,
      });
    }
    return removed;
  });
  if (!rows.length) return jsonError('ROLE_NOT_ASSIGNED', 404);
  return NextResponse.json({ data: { id: rows[0].id, revoked: true } },
    { headers: { 'Cache-Control': 'no-store' } });
}
