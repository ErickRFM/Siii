import {NextRequest,NextResponse} from 'next/server';
import {and,eq,desc} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/infrastructure/database';
import {paymentOrders,paymentTransactions,securityAuditLog} from '../../../../../../../../../../db/schema';
import {authorizeCapability,getIdentity} from '@/shared/auth/session';
import {institutionVisibility} from '@/shared/auth/read-access';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {financialTransaction} from '@/modules/financials/write-transaction';
import {recordExternalPaymentSchema} from '@/modules/financials/validation';
import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import {parsePage,cursorPredicate,cursorTimestamp,pageEnvelope} from '@/shared/http/pagination';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string;orderId:string}>};
const privateHeaders={'Cache-Control':'no-store'};
const ids=z.object({institutionId:z.uuid(),orderId:z.uuid()});
export const GET=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 const parsed=ids.safeParse(await ctx.params);if(!parsed.success)return jsonError('NOT_FOUND',404);
 const {institutionId,orderId}=parsed.data;
 if(!await getIdentity())return jsonError('UNAUTHORIZED',401);
 const actor=await authorizeCapability(institutionId,'institutions.manage');if(!actor)return jsonError('FORBIDDEN',403);
 const scope=`payments:${institutionId}:${orderId}`,page=parsePage(req,scope);if(!page)return jsonError('INVALID_QUERY',422);
 const rows=await db.select({id:paymentTransactions.id,cursorAt:cursorTimestamp(paymentTransactions.createdAt),transactionNumber:paymentTransactions.transactionNumber,amountCents:paymentTransactions.amountCents,paymentMethod:paymentTransactions.paymentMethod,reference:paymentTransactions.reference,createdAt:paymentTransactions.createdAt}).from(paymentTransactions)
  .innerJoin(paymentOrders,and(eq(paymentOrders.id,paymentTransactions.orderId),eq(paymentOrders.institutionId,institutionId)))
  .where(and(eq(paymentTransactions.institutionId,institutionId),eq(paymentTransactions.orderId,orderId),institutionVisibility(actor.subject,actor.access,actor.identity.sessionId,'institutions.manage'),cursorPredicate(page,paymentTransactions.createdAt,paymentTransactions.id)))
  .orderBy(desc(paymentTransactions.createdAt),desc(paymentTransactions.id)).limit(page.limit+1);
 const result=pageEnvelope(rows,page,scope);
 return NextResponse.json({data:result.visible.map(({cursorAt,...row})=>{void cursorAt;return row}),page:result.page},{headers:privateHeaders});
});
export const POST=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const parsed=ids.safeParse(await ctx.params);if(!parsed.success)return jsonError('NOT_FOUND',404);
 const {institutionId,orderId}=parsed.data;
 if(!await getIdentity())return jsonError('UNAUTHORIZED',401);
 const actor=await authorizeCapability(institutionId,'institutions.manage');if(!actor)return jsonError('FORBIDDEN',403);
 const input=recordExternalPaymentSchema.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const {operationId,amountCents,paymentMethod,reference,notes}=input.data;
 const transactionNumber='PAY-'+operationId;
 try{
  const outcome=await financialTransaction(actor,async tx=>{
   // Shared institutional lock in financialTransaction precedes order lock, as in other writers.
   const [order]=await tx.select().from(paymentOrders).where(and(eq(paymentOrders.id,orderId),eq(paymentOrders.institutionId,institutionId))).for('update');
   if(!order)return {error:'ORDER_NOT_FOUND',status:404} as const;
   const [prior]=await tx.select().from(paymentTransactions).where(and(eq(paymentTransactions.institutionId,institutionId),eq(paymentTransactions.transactionNumber,transactionNumber))).limit(1);
   if(prior){
    const same=prior.orderId===orderId&&prior.amountCents===amountCents&&prior.paymentMethod===paymentMethod&&(prior.reference??'')===reference&&(prior.notes??'')===notes;
    return same?{data:prior,status:200} as const:{error:'PAYMENT_OPERATION_REUSED',status:409} as const;
   }
   if(!['pending','partially_paid'].includes(order.status))return {error:'ORDER_NOT_PAYABLE',status:409} as const;
   const remaining=order.totalAmountCents-order.paidAmountCents;
   if(amountCents>remaining)return {error:'PAYMENT_EXCEEDS_BALANCE',status:409} as const;
   const paidAmountCents=order.paidAmountCents+amountCents,status=paidAmountCents===order.totalAmountCents?'paid':'partially_paid';
   const [transaction]=await tx.insert(paymentTransactions).values({institutionId,orderId,transactionNumber,amountCents,paymentMethod,reference:reference||null,notes:notes||null,receivedBy:actor.identity.id}).returning();
   await tx.update(paymentOrders).set({paidAmountCents,status,updatedAt:new Date()}).where(and(eq(paymentOrders.id,orderId),eq(paymentOrders.institutionId,institutionId)));
   await tx.insert(securityAuditLog).values({institutionId,actorUserId:actor.identity.id,requestId:requestId(req.headers),action:'financial.payment.record',target:'payment_order:'+orderId,details:{before:{paidAmountCents:order.paidAmountCents,status:order.status},after:{paidAmountCents,status,transactionId:transaction.id,operationId,amountCents,paymentMethod}}});
   return {data:transaction,status:201} as const;
  });
  if(!outcome.authorized)return jsonError('FORBIDDEN',403);
  if('error' in outcome.data&&typeof outcome.data.error==='string')return jsonError(outcome.data.error,outcome.data.status);
  return NextResponse.json({data:outcome.data.data},{status:outcome.data.status,headers:privateHeaders});
 }catch(error){
  const code=(error as {code?:string;cause?:{code?:string}}).code??(error as {cause?:{code?:string}}).cause?.code;
  if(code==='23505')return jsonError('PAYMENT_OPERATION_REUSED',409);
  throw error;
 }
});
