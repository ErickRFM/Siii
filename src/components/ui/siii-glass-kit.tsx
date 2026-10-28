import type {HTMLAttributes,ReactNode} from 'react';

/** Structural glass panel. Layout is shared; each portal owns its data and actions. */
export function SiiiGlassPanel({className='',children,...props}:HTMLAttributes<HTMLElement>){
 return <section {...props} className={['siii-overview-panel',className].filter(Boolean).join(' ')}>{children}</section>;
}

/** One responsive layout for per-role metrics without assuming the same data. */
export function SiiiGlassMetricsRow({children,className='',...props}:HTMLAttributes<HTMLDivElement>){
 return <div {...props} className={['siii-glass-metrics-grid',className].filter(Boolean).join(' ')}>{children}</div>;
}

/** Small accessible heading with an optional functional action. */
export function SiiiGlassPanelHeading({title,action}:{title:string;action?:ReactNode}){
 return <div className="siii-overview-heading"><h3>{title}</h3>{action}</div>;
}


/** Shared institutional metric — presentational only: all values come from authorized read models. */
export function SiiiGlassMetric({label,value,description,icon,accessory,tone='amber',className=''}:{
 label:string;value:ReactNode;description?:ReactNode;icon?:ReactNode;
 tone?:'amber'|'blue'|'green'|'terracotta';className?:string;accessory?:ReactNode;
}){
 return <SiiiGlassPanel className={['siii-overview-metric','siii-shared-glass-metric',accessory?'siii-metric-with-accessory':'',className].filter(Boolean).join(' ')} data-tone={tone} aria-label={label} title={typeof description==='string'?description:undefined}>
  {icon&&<span className="siii-overview-metric-icon" aria-hidden="true">{icon}</span>}
  <div className="siii-shared-metric-copy">
   <span>{label}</span>
   <strong className="tabular-nums">{value}</strong>
   {description!=null&&<small>{description}</small>}
  </div>
  {accessory&&<div className="siii-metric-accessory">{accessory}</div>}
 </SiiiGlassPanel>;
}
