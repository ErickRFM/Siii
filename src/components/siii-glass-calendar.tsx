'use client';
import {useState} from 'react';
const names=['D','L','M','M','J','V','S'];
export default function SiiiGlassCalendar({timeZone}:{timeZone:string}){
 const today=new Date(),[offset,setOffset]=useState(0);
 const shown=new Date(today.getFullYear(),today.getMonth()+offset,1);
 const yy=shown.getFullYear(),mm=shown.getMonth();
 const first=new Date(yy,mm,1).getDay(),count=new Date(yy,mm+1,0).getDate();
 const todayParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(today).map(x=>[x.type,x.value]));
 return <div><div className="flex items-center justify-between gap-2"><span className="capitalize">{new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric'}).format(shown)}</span><div className="flex gap-1"><button aria-label="Mes anterior" type="button" onClick={()=>setOffset(v=>v-1)}>‹</button><button aria-label="Mes siguiente" type="button" onClick={()=>setOffset(v=>v+1)}>›</button></div></div>
 <div className="siii-calendar-days">{names.map((x,i)=><span className="siii-glass-muted" key={i}>{x}</span>)}{Array.from({length:first},(_,i)=><span key={'b'+i}/>)}{Array.from({length:count},(_,i)=>{const d=i+1,selected=Number(todayParts.year)===yy&&Number(todayParts.month)===mm+1&&Number(todayParts.day)===d;return <span key={d} className={selected?'siii-calendar-today':''}>{d}</span>})}</div>
 <p className="siii-glass-muted mt-3">Fechas de consulta; las convocatorias se publican en avisos institucionales.</p></div>;
}
