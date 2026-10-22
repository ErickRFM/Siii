import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { paymentOrders, financialFeeTypes, institutionalStudents } from '../../../../../../../../db/schema';
import { authorizeCapability, getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { createOrderSchema } from '@/modules/financials/validation';

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

    // Institutional membership alone does not authorize reading other people's finances.
    if (!await authorizeCapability(institutionId, 'institutions.manage')) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente' } }, { status: 403 });
    }

    const orders = await db.select({
      id: paymentOrders.id,
      orderNumber: paymentOrders.orderNumber,
      totalAmountCents: paymentOrders.totalAmountCents,
      paidAmountCents: paymentOrders.paidAmountCents,
      currency: paymentOrders.currency,
      status: paymentOrders.status,
      dueDate: paymentOrders.dueDate,
      createdAt: paymentOrders.createdAt,
      feeTypeName: financialFeeTypes.name,
      studentFirstName: institutionalStudents.firstName,
      studentLastName: institutionalStudents.lastName,
      enrollmentNumber: institutionalStudents.enrollmentNumber,
    })
    .from(paymentOrders)
    .innerJoin(financialFeeTypes, eq(paymentOrders.feeTypeId, financialFeeTypes.id))
    .leftJoin(institutionalStudents, eq(paymentOrders.payerStudentId, institutionalStudents.id))
    .where(eq(paymentOrders.institutionId, institutionId))
    .orderBy(desc(paymentOrders.createdAt));

    return NextResponse.json({ data: orders }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: 'No se pudieron consultar las órdenes de pago' } }, { status: 500 });
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
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente para generar órdenes de pago' } }, { status: 403 });
    }

    const json = await request.json();
    const parseResult = createOrderSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de orden de pago no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { feeTypeId, payerStudentId, payerUserId, totalAmountCents, dueDate } = parseResult.data;

    const orderNumber = `ORD-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const [order] = await db.insert(paymentOrders).values({
      institutionId,
      orderNumber,
      feeTypeId,
      payerStudentId: payerStudentId ?? null,
      payerUserId: payerUserId ?? null,
      totalAmountCents,
      paidAmountCents: 0,
      status: 'pending',
      dueDate: dueDate ? new Date(dueDate) : null,
    }).returning();

    return NextResponse.json({ data: order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'CREATE_FAILED', message: 'No se pudo generar la orden de pago' } }, { status: 500 });
  }
}
