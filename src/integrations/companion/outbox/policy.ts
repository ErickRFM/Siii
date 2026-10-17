export const academicOutboxEnabled=()=>process.env.SIII_ACADEMIC_OUTBOX_ENABLED==='true';
export function nextAcademicAttempt(attempts:number,now:Date):Date|null{
 if(!Number.isInteger(attempts)||attempts<1||attempts>=8)return null;
 return new Date(now.getTime()+Math.min(3600000,30000*2**(attempts-1)));
}
