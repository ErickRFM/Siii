import {sql} from 'drizzle-orm';
import {z} from 'zod';
import type {Transaction} from '@/shared/http/request-context';
const uuid=z.uuid().regex(/^[0-9a-f-]+$/);
const text=(min:number,max:number)=>z.string().min(min).max(max).refine(s=>s===s.trim()&&!/[\u0000-\u001f\u007f-\u009f]/.test(s));
const code=(max:number)=>z.string().min(2).max(max).regex(/^[A-Z0-9][A-Z0-9_-]+$/);
const date=z.iso.date();
const teacher=z.object({sourceId:uuid,externalId:code(32),fullName:text(2,241)}).strict();
const enrollment=z.object({sourceId:uuid,studentSourceId:uuid,studentExternalId:code(32),fullName:text(2,241),studentStatus:z.enum(['active','inactive','withdrawn','graduated']),status:z.enum(['enrolled','withdrawn'])}).strict();
const occurrence=z.object({sourceId:uuid,patternSourceId:uuid,date,startsAt:z.iso.datetime(),endsAt:z.iso.datetime(),status:z.enum(['SCHEDULED','CANCELLED','ONLINE']),room:z.object({sourceId:uuid,code:code(32),building:text(2,120),campusSourceId:uuid,campusName:text(3,160)}).strict()}).strict();
const snapshotSchema=z.object({contract:z.literal('siii.academic_section_snapshot.v1'),sectionId:uuid,sectionCode:code(32),status:z.enum(['open','closed','archived']),timezone:z.string().refine(zone=>{try{if(/^[+-]/.test(zone))return false;new Intl.DateTimeFormat('en',{timeZone:zone}).format();return true}catch{return false}}),term:z.object({sourceId:uuid,code:code(25),startsOn:date,endsOn:date}).strict(),subject:z.object({sourceId:uuid,code:code(25),name:text(3,160),credits:z.number().int().min(0).max(30)}).strict(),teachers:z.array(teacher).max(500),enrollments:z.array(enrollment).max(500),occurrences:z.array(occurrence).max(3000)}).strict();
export type AcademicSnapshot=z.infer<typeof snapshotSchema>;
export function validateAcademicSnapshot(input:unknown):AcademicSnapshot{
 const parsed=snapshotSchema.safeParse(input);if(!parsed.success)throw Error('ACADEMIC_SNAPSHOT_INVALID');
 const value=parsed.data;if(value.term.startsOn>value.term.endsOn)throw Error('ACADEMIC_SNAPSHOT_INVALID');
 const unique=(values:string[])=>new Set(values).size===values.length;
 if(!unique(value.teachers.map(x=>x.sourceId))||!unique(value.teachers.map(x=>x.externalId))||!unique(value.enrollments.map(x=>x.sourceId))||!unique(value.enrollments.filter(x=>x.status==='enrolled').map(x=>x.studentSourceId))||!unique(value.occurrences.map(x=>x.sourceId)))throw Error('ACADEMIC_SNAPSHOT_INVALID');
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:value.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const local=(instant:string)=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));return {date:parts.year+'-'+parts.month+'-'+parts.day,time:parts.hour+':'+parts.minute+':'+parts.second}};
 for(const item of value.occurrences){const start=local(item.startsAt),end=local(item.endsAt),next=new Date(item.date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  if(item.date<value.term.startsOn||item.date>value.term.endsOn||new Date(item.startsAt)>=new Date(item.endsAt)||start.date!==item.date||new Date(item.startsAt).getMilliseconds()!==0||new Date(item.endsAt).getMilliseconds()!==0||!start.time.endsWith(':00')||!end.time.endsWith(':00')||!(end.date===item.date&&end.time>start.time||end.date===next.toISOString().slice(0,10)&&end.time==='00:00:00'))throw Error('ACADEMIC_SNAPSHOT_INVALID');
 }
 return value;
}
/** One statement gives a coherent MVCC snapshot; only persisted occurrence IDs are emitted. */
export async function academicSectionSnapshot(tx:Transaction,institutionId:string,sectionId:string):Promise<AcademicSnapshot>{
 const result=await tx.execute(sql`
 SELECT jsonb_build_object(
 'contract','siii.academic_section_snapshot.v1','sectionId',s.id,'sectionCode',s.code,'status',s.status,'timezone',i.timezone,
 'term',jsonb_build_object('sourceId',t.id,'code',t.code,'startsOn',t.start_date,'endsOn',t.end_date),
 'subject',jsonb_build_object('sourceId',c.id,'code',c.code,'name',c.name,'credits',c.credits),
 'teachers',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceId',teacher.id,'externalId',teacher.employee_number,'fullName',teacher.first_name||' '||teacher.last_name) ORDER BY teacher.id)
  FROM section_teachers st JOIN institutional_teachers teacher ON teacher.id=st.teacher_id AND teacher.institution_id=st.institution_id
  WHERE st.section_id=s.id AND st.institution_id=s.institution_id AND st.revoked_at IS NULL AND teacher.status='active'),'[]'::jsonb),
 'enrollments',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceId',e.id,'studentSourceId',student.id,'studentExternalId',student.enrollment_number,'fullName',student.first_name||' '||student.last_name,'studentStatus',student.status,'status',e.status) ORDER BY e.id)
  FROM section_enrollments e JOIN institutional_students student ON student.id=e.student_id AND student.institution_id=e.institution_id
  WHERE e.section_id=s.id AND e.institution_id=s.institution_id),'[]'::jsonb),
 'occurrences',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceId',o.id,'patternSourceId',p.id,'date',o.on_date,
  'startsAt',to_char((o.on_date+make_interval(mins=>p.start_minute)) AT TIME ZONE i.timezone AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'endsAt',to_char((o.on_date+make_interval(mins=>p.end_minute)) AT TIME ZONE i.timezone AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'status',o.state,'room',jsonb_build_object('sourceId',r.id,'code',r.code,'building',r.building,'campusSourceId',campus.id,'campusName',campus.name)) ORDER BY o.id)
  FROM class_occurrences o JOIN schedule_patterns p ON p.id=o.pattern_id AND p.section_id=o.section_id AND p.institution_id=o.institution_id
  JOIN classrooms r ON r.id=p.room_id AND r.institution_id=p.institution_id JOIN campuses campus ON campus.id=r.campus_id AND campus.institution_id=r.institution_id
  WHERE o.section_id=s.id AND o.institution_id=s.institution_id),'[]'::jsonb)) AS payload
 FROM academic_sections s JOIN institutions i ON i.id=s.institution_id
 JOIN academic_terms t ON t.id=s.term_id AND t.institution_id=s.institution_id
 JOIN academic_courses c ON c.id=s.course_id AND c.institution_id=s.institution_id
 WHERE s.id=${sectionId}::uuid AND s.institution_id=${institutionId}::uuid
 `);
 const payload=result.rows[0]?.payload as {teachers:unknown[];enrollments:unknown[];occurrences:unknown[]}|undefined;
 if(!payload)throw Error('ACADEMIC_SECTION_NOT_FOUND');
 if(payload.teachers.length>500||payload.enrollments.length>500||payload.occurrences.length>3000)throw Error('ACADEMIC_SNAPSHOT_LIMIT_EXCEEDED');
 return validateAcademicSnapshot(payload);
}
