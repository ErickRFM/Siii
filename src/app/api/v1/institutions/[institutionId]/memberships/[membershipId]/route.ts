import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { institutionMemberships, roleAssignments, securityAuditLog } from '../../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { canManageMembership } from '@/shared/auth/roles';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ institutionId: string; membershipId: string }> };
const uuid = z.string().uuid();
const schema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().min(5).max(400),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const { institutionId, membershipId } = await ctx.params;
  if (!uuid.safeParse(institutionId).success || !uuid.safeParse(membershipId).success) {
    return jsonError('INVALID_ID', 400);
  }
  const actor = await authorizeInstitution(institutionId, 'users.manage');
  if (!actor) return jsonError('FORBIDDEN', 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError('VALIDATION_ERROR', 422);

  // All mutation predicates remain tenant-scoped. A user cannot suspend or
  // reactivate their own membership via this administrative endpoint.
  const membership = await db.select({
    id: institutionMemberships.id,
    userId: institutionMemberships.userId,
    status: institutionMemberships.status,
  }).from(institutionMemberships)
    .where(and(eq(institutionMemberships.id, membershipId),
      eq(institutionMemberships.institutionId, institutionId)))
    .limit(1);

  if (!membership.length) return jsonError('MEMBERSHIP_NOT_FOUND', 404);
  if (membership[0].userId === actor.identity.id) return jsonError('SELF_CHANGE_DENIED', 403);

  const grants = await db.select({ role: roleAssignments.role })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.membershipId, membershipId), isNull(roleAssignments.revokedAt)));
  if (!canManageMembership(actor.access.roles, grants.map(g => g.role))) {
    return jsonError('TARGET_ROLE_PROTECTED', 403);
  }

  if (membership[0].status === parsed.data.status) {
    return NextResponse.json({
      data: { id: membershipId, status: membership[0].status, changed: false },
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const updated = await db.transaction(async tx => {
    // Compare-and-swap prevents stale concurrent membership updates.
    const rows = await tx.update(institutionMemberships)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(institutionMemberships.id, membershipId),
        eq(institutionMemberships.institutionId, institutionId),
        eq(institutionMemberships.status, membership[0].status)))
      .returning({ id: institutionMemberships.id, status: institutionMemberships.status });

    if (rows.length) {
      await tx.insert(securityAuditLog).values({
        actorUserId: actor.identity.id,
        institutionId,
        action: 'membership.status.change',
        target: `membership:${membershipId}:status:${membership[0].status}->${parsed.data.status}`,
      });
    }
    return rows;
  });

  if (!updated.length) return jsonError('CONCURRENT_MEMBERSHIP_CHANGE', 409);
  return NextResponse.json({
    data: { ...updated[0], changed: true },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
