import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { admissionApplications, admissionDecisions } from '../../../../../../../../../../db/schema';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { admissionDecisionSchema } from '@/modules/admissions/validation';

export async function POST(request: Request, { params }: { params: Promise<{ institutionId: string; applicationId: string }> }) {
  const { institutionId, applicationId } = await params;
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401 });
    }

    const accessList = await getInstitutionAccess(user.id);
    const access = accessList.find(a => a.institutionId === institutionId);
    if (!access) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes acceso a esta institución' } }, { status: 403 });
    }

    const subject = { id: user.id, active: true, mustChangePassword: user.mustChangePassword, grants: access.grants };
    if (!can(subject, 'institutions.manage', { institutionId })) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente para dictaminar solicitudes de admisión' } }, { status: 403 });
    }

    const json = await request.json();
    const parseResult = admissionDecisionSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de dictamen no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { decision, reason } = parseResult.data;

    const [application] = await db.select().from(admissionApplications)
      .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.institutionId, institutionId)))
      .limit(1);

    if (!application) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Solicitud de admisión no encontrada' } }, { status: 404 });
    }

    const [decisionRecord] = await db.transaction(async (tx) => {
      const [decisionRow] = await tx.insert(admissionDecisions).values({
        institutionId,
        applicationId,
        decidedBy: user.id,
        decision,
        reason,
      }).returning();

      await tx.update(admissionApplications)
        .set({ status: decision, updatedAt: new Date() })
        .where(eq(admissionApplications.id, applicationId));

      return [decisionRow];
    });

    return NextResponse.json({ data: decisionRecord }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'DECISION_FAILED', message: 'No se pudo emitir el dictamen de admisión' } }, { status: 500 });
  }
}
