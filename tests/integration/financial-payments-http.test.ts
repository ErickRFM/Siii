import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {portalFixture} from '../support/portal-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:3107';
let f:Awaited<ReturnType<typeof portalFixture>>;
function input(amountCents=2500){return {operationId:randomUUID(),amountCents,paymentMethod:'transfer',reference:'EXTERNAL-BANK-2026',notes:'Registro de prueba aislado'}}
async function pay(orderId:string,body:unknown,cookie=f.admin.cookie,origin=base,tenant=f.tenant){return fetch(`${base}/api/v1/institutions/${tenant}/financials/orders/${orderId}/payments`,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)})}
async function balance(id:string){return (await sql.query('SELECT paid_amount_cents,status FROM payment_orders WHERE id=$1',[id])).rows[0]}
describe.sequential('treasury external payments through real transactional HTTP handlers',()=>{
 beforeAll(async()=>{await sql.connect();f=await portalFixture(sql)},30000);
 afterAll(async()=>{await sql.end()});
 it('records a partial payment, persists an audit and exposes it in the owning student statement',async()=>{
  const response=await pay(f.orderId,input());expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await balance(f.orderId)).toEqual({paid_amount_cents:2500,status:'partially_paid'});
  const audit=(await sql.query("SELECT request_id,details FROM security_audit_log WHERE target=$1 AND action='financial.payment.record'",['payment_order:'+f.orderId])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].request_id).toMatch(/^[a-f0-9-]{36}$/);expect(audit[0].details).toMatchObject({before:{paidAmountCents:0,status:'pending'},after:{paidAmountCents:2500,status:'partially_paid'}});
  const statement=await fetch(`${base}/api/v1/institutions/${f.tenant}/portal/student/payments`,{headers:{cookie:f.student.cookie}});expect(statement.status).toBe(200);const rows=(await statement.json()).data;expect(rows).toEqual([expect.objectContaining({amountCents:2500,paymentMethod:'transfer'})]);expect(JSON.stringify(rows)).not.toContain('Registro de prueba');
  const foreign=await fetch(`${base}/api/v1/institutions/${f.tenant}/portal/student/payments`,{headers:{cookie:f.secondStudent.cookie}});expect((await foreign.json()).data).toEqual([]);
 });
 it('replays identical concurrent requests once without double credit or audit',async()=>{
  const id=await f.order(),body=input(10000),responses=await Promise.all([pay(id,body),pay(id,body)]);expect(responses.map(r=>r.status).sort()).toEqual([200,201]);
  expect(await balance(id)).toEqual({paid_amount_cents:10000,status:'paid'});
  const transactions=(await sql.query('SELECT id FROM payment_transactions WHERE order_id=$1',[id])).rows;expect(transactions).toHaveLength(1);
  expect((await sql.query("SELECT id FROM security_audit_log WHERE target=$1 AND action='financial.payment.record'",['payment_order:'+id])).rows).toHaveLength(1);
  expect((await responses[0].json()).data.id).toBe((await responses[1].json()).data.id);
 });
 it('treats uppercase and lowercase representations of one operation UUID as the same external payment',async()=>{
  const id=await f.order(),body=input(1000);expect((await pay(id,body)).status).toBe(201);
  const replay=await pay(id,{...body,operationId:body.operationId.toUpperCase()});expect(replay.status).toBe(200);expect((await balance(id)).paid_amount_cents).toBe(1000);
  expect((await sql.query('SELECT id FROM payment_transactions WHERE order_id=$1',[id])).rows).toHaveLength(1);
 });
 it('rejects reuse of an operation with a different amount, reference or order',async()=>{
  const first=await f.order(),second=await f.order(),body=input();expect((await pay(first,body)).status).toBe(201);
  for(const change of [{...body,amountCents:2600},{...body,reference:'OTHER'}])expect((await pay(first,change)).status).toBe(409);
  expect((await pay(second,body)).status).toBe(409);expect(await balance(second)).toEqual({paid_amount_cents:0,status:'pending'});
 });
 it('prevents concurrent overpayment using the locked current balance',async()=>{
  const id=await f.order(),responses=await Promise.all([pay(id,input(7000)),pay(id,input(7000))]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
  expect(await balance(id)).toEqual({paid_amount_cents:7000,status:'partially_paid'});expect((await sql.query('SELECT id FROM payment_transactions WHERE order_id=$1',[id])).rows).toHaveLength(1);
 });
 it.each(['cancelled','waived','refunded','paid'])('does not credit an order in %s state',async status=>{
  const id=await f.order();await sql.query('UPDATE payment_orders SET status=$1 WHERE id=$2',[status,id]);expect((await pay(id,input())).status).toBe(409);expect((await balance(id)).paid_amount_cents).toBe(0);
 });
 it('enforces origin, institution, permission, payload limits and provider availability',async()=>{
  const id=await f.order();expect((await pay(id,input(),f.student.cookie)).status).toBe(403);expect((await pay(id,input(),f.admin.cookie,'https://foreign.test')).status).toBe(403);
  expect((await pay(id,input(),f.admin.cookie,base,f.other)).status).toBe(403);expect((await pay(id,input(),'')).status).toBe(401);
  for(const invalid of [{...input(),amountCents:0},{...input(),amountCents:0.5},{...input(),paymentMethod:'card'},{...input(),paymentMethod:'adjustment'},{...input(),reference:'x'.repeat(201)},{...input(),payerStudentId:f.secondStudentId}])expect((await pay(id,invalid)).status).toBe(422);
  expect(await balance(id)).toEqual({paid_amount_cents:0,status:'pending'});
 });
 it('rolls back credit and transaction when the audit insert fails',async()=>{
  const id=await f.order(),name='vn_audit_'+randomUUID().replaceAll('-','');
  await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target='payment_order:${id}' AND NEW.action='financial.payment.record' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try{expect((await pay(id,input())).status).toBe(500);expect(await balance(id)).toEqual({paid_amount_cents:0,status:'pending'});expect((await sql.query('SELECT id FROM payment_transactions WHERE order_id=$1',[id])).rows).toEqual([])}finally{await sql.query(`DROP TRIGGER ${name} ON security_audit_log`);await sql.query(`DROP FUNCTION ${name}()`)}
 });
 it('denies payment after a cashier grant is revoked',async()=>{
  const id=await f.order();await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[f.admin.grant]);
  try{expect((await pay(id,input())).status).toBe(403);expect((await balance(id)).paid_amount_cents).toBe(0)}finally{await sql.query('UPDATE role_assignments SET revoked_at=null WHERE id=$1',[f.admin.grant])}
 });
 it('paginates treasury orders and rejects unknown filters instead of returning an unbounded tenant list',async()=>{
  const url=`${base}/api/v1/institutions/${f.tenant}/financials/orders`;
  const response=await fetch(url+'?limit=2',{headers:{cookie:f.admin.cookie}});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
  const body=await response.json();expect(body.data).toHaveLength(2);expect(body.page.nextCursor).toBeTruthy();
  expect((await fetch(url+'?payerStudentId='+f.secondStudentId,{headers:{cookie:f.admin.cookie}})).status).toBe(422);
  expect((await fetch(url,{headers:{cookie:f.student.cookie}})).status).toBe(403);
 });
 it('creates an idempotent charge in the fee currency and rejects operation reuse with changed content',async()=>{
  const fee=(await sql.query("INSERT INTO financial_fee_types(institution_id,code,name,default_amount_cents,currency) VALUES($1,'USD-TEST','Concepto de moneda externa',20000,'USD') RETURNING id",[f.tenant])).rows[0].id;
  const body={operationId:randomUUID(),feeTypeId:fee,payerStudentId:f.studentId,totalAmountCents:20000};
  async function charge(payload:unknown){return fetch(`${base}/api/v1/institutions/${f.tenant}/financials/orders`,{method:'POST',headers:{cookie:f.admin.cookie,origin:base,'content-type':'application/json'},body:JSON.stringify(payload)})}
  const first=await charge(body);expect(first.status).toBe(201);const order=(await first.json()).data;expect(order.currency).toBe('USD');
  const replay=await charge(body);expect(replay.status).toBe(200);expect((await replay.json()).data.id).toBe(order.id);
  const uppercase=await charge({...body,operationId:body.operationId.toUpperCase()});expect(uppercase.status).toBe(200);expect((await uppercase.json()).data.id).toBe(order.id);
  expect((await charge({...body,totalAmountCents:20001})).status).toBe(409);
 });
});
