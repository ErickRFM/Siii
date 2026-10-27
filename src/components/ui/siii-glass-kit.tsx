import type {ReactNode} from 'react';

/** Shared institutional metric — presentational only: all values come from authorized read models. */
export function SiiiGlassMetric({label,value,description,icon,tone='amber',className=''}:{
 label:string;value:ReactNode;description?:ReactNode;icon?:ReactNode;
 tone?:'amber'|'blue'|'green'|'terracotta';className?:string;
}){
 return <section className={['siii-overview-panel','siii-overview-metric','siii-shared-glass-metric',className].filter(Boolean).join(' ')} data-tone={tone} aria-label={label}>
  {icon&&<span className="siii-overview-metric-icon" aria-hidden="true">{icon}</span>}
  <span>{label}</span>
  <strong className="tabular-nums">{value}</strong>
  {description!=null&&<small>{description}</small>}
 </section>;
}
