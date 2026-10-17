export type AcademicDeliveryResult={status:'accepted'}|{status:'retryable'}|{status:'rejected'}|{status:'invalid';code:'BODY_INVALID'|'KEY_UNAVAILABLE'};
export type AcademicTransport=(input:{eventId:string;institutionId:string;sectionId:string;sourceVersion:number;body:string;signal:AbortSignal})=>Promise<AcademicDeliveryResult>;
export async function runAcademicTransport(transport:AcademicTransport,input:Omit<Parameters<AcademicTransport>[0],'signal'>):Promise<AcademicDeliveryResult>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([transport({...input,signal:controller.signal}),new Promise<AcademicDeliveryResult>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({status:'retryable'})},30000)})]);
 }finally{if(timer)clearTimeout(timer)}
}
