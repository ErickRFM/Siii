'use client';
import {Button} from './ui/button';
import {SiiEmptyView} from './ui/sii-kit';

export type AcademicOccurrence={id:string;date:string;state:string;sectionCode:string;courseName:string;roomCode:string;roomBuilding:string;startMinute:number;endMinute:number;reason?:string|null;campusName?:string;teacherName?:string};
export const academicClock=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function weekDates(week:string){
 const start=new Date(week+'T12:00:00Z');
 if(Number.isNaN(start.getTime()))return [];
 start.setUTCDate(start.getUTCDate()-((start.getUTCDay()||7)-1));
 return Array.from({length:7},(_,index)=>{const day=new Date(start);day.setUTCDate(day.getUTCDate()+index);return day.toISOString().slice(0,10)});
}

/** Semantic day lists keep concurrent sessions visible and individually operable. */
export function AcademicWeek({week,occurrences,busy=false,onCancel,emptyDescription='Consulta otra semana o programa una clase recurrente con una sección y aula disponibles.'}:{week:string;occurrences:AcademicOccurrence[];busy?:boolean;onCancel?:(occurrence:AcademicOccurrence)=>void;emptyDescription?:string}){
 return <section aria-label="Calendario semanal" className="sii-week-calendar">
  {weekDates(week).map(date=>{
   const day=new Date(date+'T12:00:00Z'),rows=occurrences.filter(row=>row.date.slice(0,10)===date).sort((a,b)=>a.startMinute-b.startMinute||a.sectionCode.localeCompare(b.sectionCode));
   const label=new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'}).format(day);
   return <section key={date} className="sii-week-day" aria-label={label}>
    <h3><time dateTime={date}>{label}</time><span className="sii-tab-count">{rows.length}</span></h3>
    {rows.length?<ul>{rows.map(row=><li key={row.id} className="sii-week-session" data-cancelled={row.state==='CANCELLED'}>
     <p className="sii-week-time">{academicClock(row.startMinute)}–{academicClock(row.endMinute)}</p>
     <strong>{row.courseName}</strong><span>{row.sectionCode}</span><span>{row.roomBuilding} · {row.roomCode}</span>
     {row.campusName&&<span>{row.campusName}</span>}{row.teacherName&&<span>{row.teacherName}</span>}
     <small>{row.state==='CANCELLED'?'Cancelada':row.state==='SCHEDULED'?'Programada':row.state}{row.reason?' · '+row.reason:''}</small>
     {onCancel&&row.state!=='CANCELLED'&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>onCancel(row)} aria-label={`Cancelar ${row.sectionCode} el ${date} a las ${academicClock(row.startMinute)}`}>Cancelar clase</Button>}
    </li>)}</ul>:<p className="sii-week-empty">Sin clases</p>}
   </section>;
  })}
  {!occurrences.length&&<div className="sii-week-empty-state"><SiiEmptyView icon="calendar" title="Sin clases esta semana" description={emptyDescription}/></div>}
 </section>;
}
