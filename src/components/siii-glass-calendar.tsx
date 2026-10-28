'use client';
import {useState} from 'react';

const days=['L','M','M','J','V','S','D'];

/** A navigable, Monday-first reference calendar, not a source of academic events. */
export default function SiiiGlassCalendar({timeZone}:{timeZone:string}){
 const [offset,setOffset]=useState(0);
 const now=new Date();
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone,year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(now).map(part=>[part.type,part.value]));
 const currentYear=Number(parts.year),currentMonth=Number(parts.month),currentDay=Number(parts.day);
 const shown=new Date(Date.UTC(currentYear,currentMonth-1+offset,1,12));
 const year=shown.getUTCFullYear(),month=shown.getUTCMonth();
 const first=(shown.getUTCDay()+6)%7;
 const length=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 const monthName=new Intl.DateTimeFormat('es-MX',{timeZone:'UTC',month:'long',year:'numeric'}).format(shown);
 return <div className="siii-glass-calendar" aria-label="Calendario de referencia">
  <div className="siii-calendar-header">
   <strong className="capitalize">{monthName}</strong>
   <div className="siii-calendar-controls">
    <button type="button" aria-label="Mes anterior" onClick={()=>setOffset(value=>value-1)}>‹</button>
    <button type="button" aria-label="Mes siguiente" onClick={()=>setOffset(value=>value+1)}>›</button>
   </div>
  </div>
  <div className="siii-calendar-days">
   {days.map((day,index)=><span className="siii-calendar-weekday" key={index} aria-label={['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][index]}>{day}</span>)}
   {Array.from({length:first},(_,index)=><span key={'empty-'+index} aria-hidden="true"/>)}
   {Array.from({length},(_,index)=>{
    const day=index+1;
    const isToday=year===currentYear&&month===currentMonth-1&&day===currentDay;
    return <span key={day} className={isToday?'siii-calendar-today':''} aria-current={isToday?'date':undefined}
     aria-label={new Intl.DateTimeFormat('es-MX',{timeZone:'UTC',dateStyle:'full'}).format(new Date(Date.UTC(year,month,day,12)))}>{day}</span>;
   })}
  </div>
  <p className="siii-glass-muted mt-3">Las fechas académicas oficiales se comunican mediante avisos.</p>
 </div>;
}
