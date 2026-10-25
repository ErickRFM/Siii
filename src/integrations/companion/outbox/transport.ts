export type AcademicDeliveryResult={status:'accepted'}|{status:'retryable'}|{status:'rejected'}|{status:'invalid';code:'BODY_INVALID'|'KEY_UNAVAILABLE'};
export type AcademicTransport=(input:{eventId:string;institutionId:string;sectionId:string;sourceVersion:number;body:string;signal:AbortSignal})=>Promise<AcademicDeliveryResult>;
export async function runAcademicTransport(transport:AcademicTransport,input:Omit<Parameters<AcademicTransport>[0],'signal'>,options:{timeoutMs?:number;signal?:AbortSignal}={}):Promise<AcademicDeliveryResult>{
 const timeoutMs=options.timeoutMs??30000;
 if(!Number.isFinite(timeoutMs)||timeoutMs<0||timeoutMs>30000)throw Error('ACADEMIC_TRANSPORT_TIMEOUT_INVALID');
 if(options.signal?.aborted||timeoutMs===0)return {status:'retryable'};
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
 try{
  const cancelled=new Promise<AcademicDeliveryResult>(resolve=>{abort=()=>{controller.abort();resolve({status:'retryable'});};timer=setTimeout(abort,timeoutMs);options.signal?.addEventListener('abort',abort,{once:true});});
  return await Promise.race([transport({...input,signal:controller.signal}),cancelled]);
 }finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
