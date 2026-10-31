'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {NativeSelect} from './ui/native-select';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import {SiiDrawer} from './ui/sii-workspace';
import {SiiPageIntro,SiiSkeleton,SiiEmptyView} from './ui/sii-kit';
import {PersonalTable} from './personal-table';
import {SiiiGlassMetric,SiiiGlassMetricsRow} from './ui/siii-glass-kit';
import {useInstitutionConfirmation} from './sii-confirmation';
import {readCollection,CollectionReadError} from '@/shared/client/read-collection';
import {recordExternalPaymentSchema} from '@/modules/financials/validation';
import {financeStatus,formatMoney,type PersonalOrder} from '@/modules/portal/contracts';

type Fee={id:string;code:string;name:string;defaultAmountCents:number;currency:string;status:string};
type Student={id:string;firstName:string;lastName:string;enrollmentNumber:string;status:string};
type Movement={id:string;transactionNumber:string;amountCents:number;paymentMethod:string;reference:string|null;createdAt:string};
type Payment={operationId:string;amountCents:number;paymentMethod:'cash'|'transfer';reference:string;notes:string};
function cents(value:FormDataEntryValue|null){const text=String(value??'');if(!/^\d{1,8}(\.\d{1,2})?$/.test(text))return null;const [whole,fraction='']=text.split('.');const total=Number(whole)*100+Number(fraction.padEnd(2,'0'));return total>0&&total<=2147483647?total:null}
function feedback(code:string){return ({FORBIDDEN:'Tu acceso cambió. Verifica tu seguridad o solicita autorización a la institución.',UNAUTHORIZED:'Tu sesión venció. Inicia sesión nuevamente.',PAYMENT_EXCEEDS_BALANCE:'El importe supera el saldo vigente. Actualiza la orden antes de intentar otro registro.',ORDER_NOT_PAYABLE:'La orden ya no admite pagos. Actualiza su estado.',PAYMENT_OPERATION_REUSED:'Esta operación ya se utilizó con otros datos. Consulta los movimientos antes de registrar otro pago.',VALIDATION_ERROR:'Revisa importe, medio y referencia.',INVALID_INPUT:'Revisa los datos y las dependencias de la operación.'} as Record<string,string>)[code]??'No se pudo confirmar la operación. Conservamos los datos para reintentar.'}

export default function FinancialWorkspace({institutionId,institutionName}:{institutionId:string;institutionName:string}){
 const base=`/api/v1/institutions/${institutionId}`,{ask,confirmation}=useInstitutionConfirmation();
 const [data,setData]=useState<{orders:PersonalOrder[];fees:Fee[];students:Student[]}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [mode,setMode]=useState<'payment'|'fee'|'order'|'movements'|null>(null),[selected,setSelected]=useState<PersonalOrder|null>(null),[movements,setMovements]=useState<Movement[]>([]),[movementsBusy,setMovementsBusy]=useState(false);
 const [busy,setBusy]=useState(false),[formError,setFormError]=useState(''),[review,setReview]=useState<Payment|null>(null);
 const active=useRef<AbortController|null>(null),movementRead=useRef<AbortController|null>(null),authorityRead=useRef<AbortController|null>(null),write=useRef(false),operationId=useRef(''),reviewAttempted=useRef(false),modeRef=useRef(mode);
 modeRef.current=mode;
 const retirePrivate=useCallback(()=>{active.current?.abort();movementRead.current?.abort();setData(null);setSelected(null);setMovements([]);setReview(null);setMode(null);setFormError('');setLoading(false);setError('Tu acceso a Caja cambió. Verifica tu sesión y solicita autorización a la institución.');},[]);
 const load=useCallback(async()=>{
  active.current?.abort();const controller=new AbortController();active.current=controller;
  setLoading(true);setError('');setData(null);
  try{
   const [orders,fees,students]=await Promise.all([readCollection<PersonalOrder>(base+'/financials/orders',{signal:controller.signal}),readCollection<Fee>(base+'/financials/fee-types',{signal:controller.signal}),readCollection<Student>(base+'/registry/students',{signal:controller.signal})]);
   if(!controller.signal.aborted)setData({orders:orders.data,fees:fees.data,students:students.data});
  }catch{if(!controller.signal.aborted)setError('No se pudo consultar Caja. Comprueba tu conexión y tu acceso vigente.')}
  finally{if(!controller.signal.aborted)setLoading(false)}
 },[base]);
 useEffect(()=>{
  void load();
  const focus=async()=>{
   if(document.visibilityState!=='visible')return;
   if(!modeRef.current){void load();return}
   authorityRead.current?.abort();const controller=new AbortController();authorityRead.current=controller;
   try{const response=await fetch(base+'/capabilities',{cache:'no-store',signal:controller.signal});const body=await response.json().catch(()=>null);if(!controller.signal.aborted&&(response.status===401||response.status===403||response.ok&&(body?.data?.restricted||!body?.data?.capabilities?.includes('institutions.manage'))))retirePrivate()}
   catch{if(!controller.signal.aborted)setFormError('No se pudo revalidar la sesión. Comprueba tu conexión antes de confirmar.')}
  };
  window.addEventListener('focus',focus);window.addEventListener('online',focus);document.addEventListener('visibilitychange',focus);
  return ()=>{active.current?.abort();movementRead.current?.abort();authorityRead.current?.abort();window.removeEventListener('focus',focus);window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',focus)};
 },[load,base,retirePrivate]);
 function open(next:NonNullable<typeof mode>,order?:PersonalOrder){movementRead.current?.abort();setMovementsBusy(false);setMode(next);setSelected(order??null);setFormError('');setReview(null);setMovements([]);operationId.current=crypto.randomUUID();reviewAttempted.current=false}
 async function close(){if(write.current)return;if(mode!=='movements'&&!await ask({title:'Cerrar operación sin confirmar',description:'Los datos del formulario no se guardarán. Si intentaste registrar un pago y se perdió la respuesta, consulta primero los movimientos.',confirmLabel:'Cerrar formulario'}))return;movementRead.current?.abort();setMovements([]);setMode(null);setSelected(null);setReview(null);void load()}
 async function save(resource:string,payload:unknown){
  if(write.current)return false;write.current=true;setBusy(true);setFormError('');
  try{
   const response=await fetch(base+resource,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
   const body=await response.json().catch(()=>null);
   if(response.status===401||response.status===403){retirePrivate();return false}
   if(!response.ok){setFormError(feedback(body?.error?.code??'FAILED'));return false}
   if(!body?.data?.id){setFormError('El servidor no confirmó el registro. Reintenta con los mismos datos.');return false}
   return true;
  }catch{setFormError('Sin confirmación del servidor. Reintenta este mismo registro; se conserva la clave de operación para evitar duplicados.');return false}
  finally{write.current=false;setBusy(false)}
 }
 function preparePayment(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selected)return;const form=new FormData(event.currentTarget),amount=cents(form.get('amount'));const parsed=recordExternalPaymentSchema.safeParse({operationId:operationId.current,amountCents:amount,paymentMethod:form.get('paymentMethod'),reference:form.get('reference'),notes:form.get('notes')});if(!parsed.success){setFormError('Revisa el importe y la referencia de transferencia. Usa hasta dos decimales y un monto mayor a cero.');return}if(parsed.data.amountCents>selected.totalAmountCents-selected.paidAmountCents){setFormError('El importe supera el saldo de la orden consultada.');return}setFormError('');setReview(parsed.data)}
 async function confirmPayment(){if(!selected||!review||write.current)return;reviewAttempted.current=true;if(await save('/financials/orders/'+selected.id+'/payments',review)){setMode(null);setSelected(null);setReview(null);setNotice('Pago registrado. El saldo y los movimientos del alumno se actualizaron.');await load()}}
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(write.current)return;const form=new FormData(event.currentTarget),amount=cents(form.get('amount'));if(amount===null){setFormError('Escribe un importe válido mayor a cero con hasta dos decimales.');return}
  let payload:unknown;
  if(mode==='fee')payload={code:form.get('code'),name:form.get('name'),defaultAmountCents:amount,currency:'MXN'};
  else payload={operationId:operationId.current,feeTypeId:form.get('feeTypeId'),payerStudentId:form.get('payerStudentId'),totalAmountCents:amount,...(form.get('dueDate')?{dueDate:new Date(String(form.get('dueDate'))+'T23:59:59').toISOString()}:{})};
  if(!await ask({title:mode==='fee'?'Crear concepto de cobro':'Generar orden de pago',description:`Se registrará ${mode==='fee'?'un concepto':'un cargo al estudiante seleccionado'} por ${formatMoney(amount,'MXN')}. Revisa los datos antes de confirmar.`,confirmLabel:'Confirmar registro'}))return;
  if(await save(mode==='fee'?'/financials/fee-types':'/financials/orders',payload)){setMode(null);setNotice(mode==='fee'?'Concepto registrado.':'Orden de pago generada.');await load()}
 }
 async function viewMovements(order:PersonalOrder){
  open('movements',order);const controller=new AbortController();movementRead.current=controller;setMovementsBusy(true);
  try{const rows=await readCollection<Movement>(base+'/financials/orders/'+order.id+'/payments',{signal:controller.signal});if(!controller.signal.aborted&&movementRead.current===controller)setMovements(rows.data)}
  catch(cause){if(!controller.signal.aborted){if(cause instanceof CollectionReadError&&[401,403].includes(cause.status))retirePrivate();else setFormError('No se pudieron consultar los movimientos de la orden.')}}
  finally{if(!controller.signal.aborted&&movementRead.current===controller)setMovementsBusy(false)}
 }
 return <div className="sii-workspace siii-glass-workspace space-y-6"><SiiPageIntro eyebrow="OPERACIÓN FINANCIERA" title="Caja y finanzas" description={institutionName+' · Registro de cobros externos y órdenes institucionales.'} actions={<div className="sii-page-actions"><Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link><Button variant="outline" disabled={loading||busy} onClick={()=>void load()}>Actualizar Caja</Button></div>}/>
  <p className="rounded-lg border p-4 text-sm text-muted-foreground">Registra únicamente dinero recibido por medios externos autorizados. Las tarjetas y los pagos en línea requieren una pasarela institucional; no están habilitados en este módulo.</p>
  {error&&<p role="alert" className="sii-catalog-error">{error} <Button variant="outline" onClick={()=>void load()}>Reintentar</Button></p>}{notice&&<p role="status" className="rounded-lg border border-primary/30 bg-primary-soft p-4 text-sm">{notice}</p>}
  {loading&&<SiiSkeleton label="Consultando órdenes y conceptos de Caja"/>}
  {data&&<SiiiGlassMetricsRow aria-label="Resumen de Caja" className="siii-finance-metrics">
   <SiiiGlassMetric label="Órdenes consultadas" value={data.orders.length} description="En el registro disponible" tone="amber"/>
   <SiiiGlassMetric label="Órdenes pendientes" value={data.orders.filter(order=>['pending','partially_paid'].includes(order.status)).length} description="Pendientes de liquidación" tone="terracotta"/>
   <SiiiGlassMetric label="Conceptos activos" value={data.fees.filter(fee=>fee.status==='active').length} description="Disponibles para cobro" tone="green"/>
  </SiiiGlassMetricsRow>}
  {data&&<Tabs defaultValue="orders" className="space-y-5"><TabsList className="sii-workspace-tabs flex h-auto flex-wrap justify-start gap-1"><TabsTrigger value="orders" className="min-h-11">Órdenes de pago</TabsTrigger><TabsTrigger value="fees" className="min-h-11">Conceptos de cobro</TabsTrigger></TabsList>
   <TabsContent value="orders" className="space-y-4"><Button disabled={!data.fees.some(fee=>fee.status==='active'&&fee.currency==='MXN')||!data.students.some(student=>student.status==='active')} onClick={()=>open('order')}>Generar orden</Button>{(!data.fees.length||!data.students.length)&&<p className="text-sm text-muted-foreground">Para generar una orden necesitas un concepto activo y un estudiante registrado.</p>}<PersonalTable label="Órdenes institucionales" rows={data.orders} searchText={row=>row.orderNumber+' '+row.feeTypeName+' '+row.enrollmentNumber+' '+row.studentFirstName+' '+row.studentLastName} columns={[{label:'Orden / concepto',render:row=><><strong>{row.feeTypeName}</strong><p className="break-all text-xs text-muted-foreground">{row.orderNumber}</p></>},{label:'Estudiante',render:row=><>{row.enrollmentNumber??'Cuenta institucional'}<p>{row.studentFirstName} {row.studentLastName}</p></>},{label:'Importe / pagado',render:row=><>{formatMoney(row.totalAmountCents,row.currency)}<p className="text-sm text-muted-foreground">Abonos: {formatMoney(row.paidAmountCents,row.currency)}</p></>},{label:'Estado',render:row=>financeStatus[row.status]??row.status},{label:'Operaciones',render:row=><div className="flex flex-wrap gap-2">{['pending','partially_paid'].includes(row.status)&&<Button variant="outline" size="sm" onClick={()=>open('payment',row)}>Registrar pago</Button>}<Button variant="outline" size="sm" onClick={()=>void viewMovements(row)}>Movimientos</Button></div>}]}/></TabsContent>
   <TabsContent value="fees" className="space-y-4"><Button onClick={()=>open('fee')}>Crear concepto</Button><PersonalTable label="Conceptos de cobro" rows={data.fees} searchText={fee=>fee.code+' '+fee.name} columns={[{label:'Clave',render:fee=>fee.code},{label:'Concepto',render:fee=>fee.name},{label:'Importe predeterminado',render:fee=>formatMoney(fee.defaultAmountCents,fee.currency)},{label:'Estado',render:fee=>fee.status==='active'?'Activo':'Inactivo'}]}/></TabsContent>
  </Tabs>}
  <SiiDrawer open={Boolean(mode)} onOpenChange={value=>{if(!value)void close()}} busy={busy} title={mode==='payment'?'Registrar pago externo':mode==='movements'?'Movimientos de la orden':mode==='fee'?'Crear concepto':'Generar orden de pago'} description={selected?`${selected.feeTypeName} · ${selected.orderNumber}`:'Operación institucional con registro de auditoría.'}>
   {formError&&<p role="alert" className="sii-catalog-error">{formError}</p>}
   {mode==='payment'&&selected&&(review?<div className="space-y-5"><h3 className="font-semibold">Revisar pago recibido</h3><dl className="space-y-3"><div><dt>Importe</dt><dd className="font-bold">{formatMoney(review.amountCents,selected.currency)}</dd></div><div><dt>Medio</dt><dd>{review.paymentMethod==='cash'?'Efectivo':'Transferencia'}</dd></div><div><dt>Referencia</dt><dd className="break-all">{review.reference||'Sin referencia'}</dd></div></dl><p className="text-sm text-muted-foreground">Confirma únicamente si Caja recibió el dinero. El servidor volverá a comprobar el saldo.</p><Button disabled={busy} onClick={()=>void confirmPayment()}>{busy?'Registrando…':'Confirmar registro del pago'}</Button>{!reviewAttempted.current&&<Button variant="outline" disabled={busy} onClick={()=>setReview(null)}>Volver al formulario</Button>}</div>:<form className="password-form" onSubmit={preparePayment}><p>Saldo consultado: <strong>{formatMoney(selected.totalAmountCents-selected.paidAmountCents,selected.currency)}</strong></p><label htmlFor="payment-amount">Importe recibido ({selected.currency})</label><Input id="payment-amount" name="amount" inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="0.00"/><label htmlFor="payment-method">Método de pago</label><NativeSelect id="payment-method" name="paymentMethod" defaultValue="cash"><option value="cash">Efectivo</option><option value="transfer">Transferencia externa</option></NativeSelect><label htmlFor="payment-reference">Referencia externa</label><Input id="payment-reference" name="reference" maxLength={200}/><label htmlFor="payment-notes">Notas internas</label><Input id="payment-notes" name="notes" maxLength={1000}/><Button type="submit">Revisar pago</Button></form>)}
   {mode==='movements'&&(movementsBusy?<SiiSkeleton label="Consultando movimientos"/>:movements.length?<PersonalTable label="Movimientos de la orden" rows={movements} columns={[{label:'Fecha',render:row=>new Date(row.createdAt).toLocaleString('es-MX')},{label:'Importe',render:row=>formatMoney(row.amountCents,selected?.currency??'MXN')},{label:'Medio',render:row=>row.paymentMethod==='cash'?'Efectivo':row.paymentMethod==='transfer'?'Transferencia':row.paymentMethod},{label:'Referencia',render:row=>row.reference??'Sin referencia'}]}/>:<SiiEmptyView icon="services" title="Sin abonos registrados" description="Esta orden todavía no tiene movimientos confirmados."/>)}
   {(mode==='fee'||mode==='order')&&data&&<form className="password-form" onSubmit={event=>void create(event)}>
    {mode==='fee'?<><label htmlFor="fee-code">Clave del concepto</label><Input id="fee-code" name="code" minLength={2} maxLength={20} required disabled={busy}/><label htmlFor="fee-name">Nombre del concepto</label><Input id="fee-name" name="name" minLength={3} maxLength={160} required disabled={busy}/></>:<><label htmlFor="order-student">Estudiante</label><NativeSelect id="order-student" name="payerStudentId" defaultValue="" required disabled={busy}><option value="" disabled>Seleccionar matrícula</option>{data.students.filter(student=>student.status==='active').map(student=><option key={student.id} value={student.id}>{student.enrollmentNumber} · {student.firstName} {student.lastName}</option>)}</NativeSelect><label htmlFor="order-fee">Concepto</label><NativeSelect id="order-fee" name="feeTypeId" defaultValue="" required disabled={busy}><option value="" disabled>Seleccionar concepto</option>{data.fees.filter(fee=>fee.status==='active'&&fee.currency==='MXN').map(fee=><option key={fee.id} value={fee.id}>{fee.name} · {formatMoney(fee.defaultAmountCents,fee.currency)}</option>)}</NativeSelect><label htmlFor="order-due">Fecha límite</label><Input id="order-due" name="dueDate" type="date" disabled={busy}/></>}
    <label htmlFor="finance-create-amount">Importe (MXN)</label><Input id="finance-create-amount" name="amount" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required disabled={busy}/><Button type="submit" disabled={busy}>{busy?'Registrando…':'Revisar y registrar'}</Button>
   </form>}
  </SiiDrawer>{confirmation}
 </div>;
}
