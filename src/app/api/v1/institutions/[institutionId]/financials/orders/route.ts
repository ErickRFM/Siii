import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { paymentOrders, financialFeeTypes, institutionalStudents, institutionMemberships, securityAuditLog } from '../../../../../../../../db/schema';
import { authorizeCapability, getIdentity } from '@/shared/auth/session';
import {institutionVisibility} from '@/shared/auth/read-access';
import {parsePage,cursorPredicate,cursorTimestamp,pageEnvelope} from '@/shared/http/pagination';
import { createOrderSchema } from '@/modules/financials/validation';
import { assertSameOrigin, jsonError } from '@/shared/auth/guards';
import { withDomainErrors } from '@/modules/consolidation/domain-boundary';
import { financialTransaction } from '@/modules/financials/write-transaction';
import { requestId } from '@/shared/http/request-context';
import {randomUUID} from 'node:crypto';

export const GET=withDomainErrors(async(request: NextRequest, { params }: { params: Promise<{ institutionId: string }> })=>{
  const { institutionId } = await params;
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401 });
    }

    // Institutional membership alone does not authorize reading other people's finances.
    const access=await authorizeCapability(institutionId, 'institutions.manage');
    if (!access) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente' } }, { status: 403 });
    }

    const scope=`financial-orders:${institutionId}`,page=parsePage(request,scope);if(!page)return jsonError('INVALID_QUERY',422);
    const orders = await db.select({
      id: paymentOrders.id,
      cursorAt:cursorTimestamp(paymentOrders.createdAt),
      payerStudentId:paymentOrders.payerStudentId,
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
    .innerJoin(financialFeeTypes, and(eq(paymentOrders.feeTypeId, financialFeeTypes.id),eq(paymentOrders.institutionId,financialFeeTypes.institutionId)))
    .leftJoin(institutionalStudents, and(eq(paymentOrders.payerStudentId, institutionalStudents.id),eq(paymentOrders.institutionId,institutionalStudents.institutionId)))
    .where(and(eq(paymentOrders.institutionId, institutionId),institutionVisibility(access.subject,access.access,access.identity.sessionId,'institutions.manage'),cursorPredicate(page,paymentOrders.createdAt,paymentOrders.id)))
    .orderBy(desc(paymentOrders.createdAt),desc(paymentOrders.id)).limit(page.limit+1);
    const result=pageEnvelope(orders,page,scope);
    return NextResponse.json({ data: result.visible.map(({cursorAt,...row})=>{void cursorAt;return row}),page:result.page }, { status: 200,headers:{'Cache-Control':'no-store'} });
  } catch {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: 'No se pudieron consultar las órdenes de pago' } }, { status: 500 });
  }
});

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
    const parseResult = createOrderSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de orden de pago no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { feeTypeId, payerStudentId, payerUserId, totalAmountCents, dueDate,operationId } = parseResult.data;

    const orderNumber = 'ORD-'+(operationId??randomUUID());

    const outcome=await financialTransaction(access,async tx=>{
     const [prior]=await tx.select().from(paymentOrders).where(and(eq(paymentOrders.institutionId,institutionId),eq(paymentOrders.orderNumber,orderNumber))).limit(1);
     if(prior){
      const same=prior.feeTypeId===feeTypeId&&prior.payerStudentId===(payerStudentId??null)&&prior.payerUserId===(payerUserId??null)&&prior.totalAmountCents===totalAmountCents&&(prior.dueDate?.getTime()??null)===(dueDate?new Date(dueDate).getTime():null);
      return same?{row:prior,replay:true}:{conflict:true} as const;
     }
     const [fee]=await tx.select({id:financialFeeTypes.id,currency:financialFeeTypes.currency}).from(financialFeeTypes).where(and(eq(financialFeeTypes.id,feeTypeId),eq(financialFeeTypes.institutionId,institutionId),eq(financialFeeTypes.status,'active'))).for('share');
     if(!fee)return null;
     if(payerStudentId){
      const [student]=await tx.select({id:institutionalStudents.id}).from(institutionalStudents).where(and(eq(institutionalStudents.id,payerStudentId),eq(institutionalStudents.institutionId,institutionId))).for('share');
      if(!student)return null;
     }
     if(payerUserId){
      const [membership]=await tx.select({id:institutionMemberships.id}).from(institutionMemberships).where(and(eq(institutionMemberships.userId,payerUserId),eq(institutionMemberships.institutionId,institutionId))).for('share');
      if(!membership)return null;
     }
     const [row] = await tx.insert(paymentOrders).values({
      institutionId,
      orderNumber,
      feeTypeId,
      payerStudentId: payerStudentId ?? null,
      payerUserId: payerUserId ?? null,
      totalAmountCents,
      paidAmountCents: 0,
      currency:fee.currency,
      status: 'pending',
      dueDate: dueDate ? new Date(dueDate) : null,
    }).returning();
     await tx.insert(securityAuditLog).values({actorUserId:access.identity.id,institutionId,requestId:requestId(request.headers),action:'financial.order.create',target:'payment_order:'+row.id,details:{after:{feeTypeId,payerStudentId:row.payerStudentId,payerUserId:row.payerUserId,totalAmountCents,currency:row.currency,status:row.status}}});
     return {row,replay:false};
    });
    if(!outcome.authorized)return jsonError('FORBIDDEN',403);
    if(!outcome.data)return jsonError('INVALID_INPUT',400);
    if('conflict' in outcome.data)return jsonError('ORDER_OPERATION_REUSED',409);

    return NextResponse.json({ data: outcome.data.row }, { status: outcome.data.replay?200:201,headers:{'Cache-Control':'no-store'} });
  } catch {
    return NextResponse.json({ error: { code: 'CREATE_FAILED', message: 'No se pudo generar la orden de pago' } }, { status: 500 });
  }
});
