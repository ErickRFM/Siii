import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { admissionCycles } from '../../../../../../../../db/schema';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { admissionCycleSchema } from '@/modules/admissions/validation';

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const cycles = await db.select().from(admissionCycles)
      .where(eq(admissionCycles.institutionId, institutionId))
      .orderBy(desc(admissionCycles.startDate));

    return NextResponse.json({ data: cycles }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'CYCLES_FETCH_FAILED', message: 'No se pudieron consultar las convocatorias' } }, { status: 500 });
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
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente para gestionar convocatorias de admisión' } }, { status: 403 });
    }

    const json = await request.json();
    const parseResult = admissionCycleSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de convocatoria no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { code, name, startDate, endDate, status } = parseResult.data;

    const [cycle] = await db.insert(admissionCycles).values({
      institutionId,
      code,
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status,
    }).returning();

    return NextResponse.json({ data: cycle }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'CYCLE_CREATE_FAILED', message: 'No se pudo crear la convocatoria de admisión' } }, { status: 500 });
  }
}
