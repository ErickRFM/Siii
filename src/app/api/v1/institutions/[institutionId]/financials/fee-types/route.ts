import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { financialFeeTypes, securityAuditLog } from '../../../../../../../../db/schema';
import { authorizeCapability, getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { feeTypeSchema } from '@/modules/financials/validation';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { withDomainErrors } from '@/modules/consolidation/domain-boundary';
import { financialTransaction } from '@/modules/financials/write-transaction';
import { requestId } from '@/shared/http/request-context';

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
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
    if (!can(subject, 'institutions.read', { institutionId })) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente' } }, { status: 403 });
    }

    const feeTypes = await db.select().from(financialFeeTypes)
      .where(eq(financialFeeTypes.institutionId, institutionId))
      .orderBy(desc(financialFeeTypes.createdAt));

    return NextResponse.json({ data: feeTypes }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: 'No se pudieron consultar los conceptos de cobro' } }, { status: 500 });
  }
}

export const POST=withDomainErrors(async (request: NextRequest, { params }: { params: Promise<{ institutionId: string }> })=>{
  if (!assertSameOrigin(request)) return jsonError('INVALID_ORIGIN',403);
  const { institutionId } = await params;
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401 });
    }

    const access = await authorizeCapability(institutionId,'institutions.manage');
    if (!access) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes acceso a esta institución' } }, { status: 403 });
    }

    const json:unknown = await request.json().catch(()=>null);
    const parseResult = feeTypeSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de concepto no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { code, name, defaultAmountCents, currency, status } = parseResult.data;

    const outcome=await financialTransaction(access,async tx=>{
     const [row] = await tx.insert(financialFeeTypes).values({
      institutionId,
      code,
      name,
      defaultAmountCents,
      currency,
      status,
    }).returning();
     await tx.insert(securityAuditLog).values({actorUserId:access.identity.id,institutionId,requestId:requestId(request.headers),action:'financial.fee_type.create',target:'financial_fee_type:'+row.id,details:{after:{code,defaultAmountCents,currency,status}}});
     return row;
    });

    if(!outcome.authorized)return jsonError('FORBIDDEN',403);
    return NextResponse.json({ data: outcome.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'CREATE_FAILED', message: 'No se pudo crear el concepto de cobro' } }, { status: 500 });
  }
});
