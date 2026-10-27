import { z } from 'zod';
const code=z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).transform(s=>s.toUpperCase());
export const roomCreate=z.strictObject({campusId:z.uuid(),code,building:z.string().trim().min(2).max(120),capacity:z.number().int().min(1).max(5000)});
export const patternCreate=z.strictObject({
 sectionId:z.uuid(),roomId:z.uuid(),weekday:z.number().int().min(1).max(7),
 startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440)
}).refine(x=>x.endMinute>x.startMinute,{path:['endMinute'],message:'END_AFTER_START_REQUIRED'});
export const occurrenceUpdate=z.strictObject({id:z.uuid(),state:z.enum(['CANCELLED','ONLINE']),reason:z.string().trim().min(6).max(400)});
export function intervalOverlaps(a:{startMinute:number;endMinute:number},b:{startMinute:number;endMinute:number}){
 return a.startMinute<b.endMinute && a.endMinute>b.startMinute;
}
export function occurrenceDates(startDate:string,endDate:string,weekday:number):string[]{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||!Number.isInteger(weekday)||weekday<1||weekday>7)throw Error('INVALID_TERM');
 const start=Date.parse(startDate+'T12:00:00Z'),end=Date.parse(endDate+'T12:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>370*86400000)throw Error('INVALID_TERM_RANGE');
 const dates:string[]=[];
 for(let stamp=start;stamp<=end;stamp+=86400000){
  const date=new Date(stamp);const isoDay=date.getUTCDay()||7;
  if(isoDay===weekday)dates.push(date.toISOString().slice(0,10));
 }
 return dates;
}
