const validDate=(value:unknown):value is Date=>value instanceof Date&&Number.isFinite(value.getTime());
export function usableInvitation(row:{state:string;expiresAt:Date;consumedAt:Date|null},now:Date):boolean{
 return validDate(now)&&row.state==='pending'&&row.consumedAt===null&&validDate(row.expiresAt)&&row.expiresAt>now;
}
export function claimableDelivery(row:{state:string;expiresAt:Date;nextAttemptAt:Date;leaseUntil:Date|null;attempts:number},now:Date):boolean{
 return validDate(now)&&row.state==='queued'&&validDate(row.expiresAt)&&row.expiresAt>now
  &&validDate(row.nextAttemptAt)&&row.nextAttemptAt<=now
  &&(row.leaseUntil===null||(validDate(row.leaseUntil)&&row.leaseUntil<=now))
  &&Number.isSafeInteger(row.attempts)&&row.attempts>=0&&row.attempts<8;
}
/** Stop strictly before 24h provider idempotency expiry, even if a prior send had ambiguous acceptance. */
export function nextDeliveryAttempt(attempts:number,createdAt:Date,now:Date):Date|null{
 if(!Number.isSafeInteger(attempts)||attempts<1||attempts>=8||!validDate(createdAt)||!validDate(now)||createdAt>now)return null;
 const next=new Date(now.getTime()+Math.min(1800000,30000*2**(attempts-1)));
 return next.getTime()<createdAt.getTime()+23*3600000?next:null;
}
