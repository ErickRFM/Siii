/** Presentation-only date helpers for es-MX institutional screens. */
const LOCALE='es-MX';

/** "2 dic 2026, 21:34": compact, unambiguous, local time. */
export function formatDateTime(value:string|number|Date){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '—';
 return date.toLocaleString(LOCALE,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

/** "miércoles 2 de diciembre, 21:34": used where the reader decides a deadline. */
export function formatDeadline(value:string|number|Date){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '—';
 return date.toLocaleString(LOCALE,{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
}

/** "en 3 días", "en 5 horas", "hace 2 días". */
export function formatRelative(value:string|number|Date,now=Date.now()){
 const diff=new Date(value).getTime()-now;
 if(!Number.isFinite(diff))return '';
 const rtf=new Intl.RelativeTimeFormat(LOCALE,{numeric:'auto'});
 const hours=Math.round(diff/3600000);
 return Math.abs(hours)<36?rtf.format(hours,'hour'):rtf.format(Math.round(diff/86400000),'day');
}

/** Value for <input type="datetime-local"> in the device's time zone. */
export function toLocalInputValue(value:Date|number){
 const date=new Date(value);
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
