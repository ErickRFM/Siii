import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { financialFeeTypes } from '../../../../../../../../db/schema';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { feeTypeSchema } from '@/modules/financials/validation';

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const feeTypes = await db.select().from(financialFeeTypes)
      .where(eq(financialFeeTypes.institutionId, institutionId))
      .orderBy(desc(financialFeeTypes.createdAt));

    return NextResponse.json({ data: feeTypes }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: 'No se pudieron consultar los conceptos de cobro' } }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
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
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente para gestionar conceptos financieros' } }, { status: 403 });
    }

    const json = await request.json();
    const parseResult = feeTypeSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de concepto no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { code, name, defaultAmountCents, currency, status } = parseResult.data;

    const [feeType] = await db.insert(financialFeeTypes).values({
      institutionId,
      code,
      name,
      defaultAmountCents,
      currency,
      status,
    }).returning();

    return NextResponse.json({ data: feeType }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'CREATE_FAILED', message: 'No se pudo crear el concepto de cobro' } }, { status: 500 });
  }
}
