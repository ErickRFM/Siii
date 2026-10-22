import Link from 'next/link';
import type {Route} from 'next';
import type {ReactNode} from 'react';
import {SiiNavIcon,type SiiNavIconName} from '../sii-nav-icon';

/** Reusable presentation primitives. Server and client compatible; no permission decisions. */
export function SiiPageIntro({eyebrow,title,description,actions,hero=false}:{
 eyebrow:string;title:string;description:string;actions?:ReactNode;hero?:boolean;
}){
 return <>
   <div className="sii-page-eyebrow">{eyebrow}<span className="sii-page-eyebrow-line"/></div>
   <div className={hero?'sii-page-heading sii-kit-page-heading sii-kit-page-heading--hero':'sii-page-heading sii-kit-page-heading'}><div>
     <h1>{title}<span className="sii-welcome-period">.</span></h1>
     <p>{description}</p>
   </div>{actions}</div>
 </>;
}
export function SiiSectionHeader({eyebrow,title,description,right,outside=false,workspace=false}:{
 eyebrow:string;title:string;description?:string;right?:ReactNode;outside?:boolean;workspace?:boolean;
}){
 return <div className={'sii-panel-top sii-kit-section-header'+(outside?' sii-panel-top--outside':'')+(workspace?' sii-catalog-summary':'')}>
   <div><span className="sii-section-kicker">{eyebrow}</span><h2>{title}</h2>{description&&<p>{description}</p>}</div>{right}
 </div>;
}
export function SiiMetricTile({label,value,caption,icon,tone='rose',href,actionLabel}:{
 label:string;value:ReactNode;caption?:string;icon:SiiNavIconName;tone?:'rose'|'amber'|'blue';href?:string;actionLabel?:string;
}){
 return <article className="sii-metric sii-kit-metric">
   <span className={'sii-metric-icon sii-metric-icon--'+tone} aria-hidden="true"><SiiNavIcon name={icon}/></span>
   <span className="sii-metric-label">{label}</span>
   <span className={'sii-metric-value'+(typeof value==='string'?' sii-metric-value--text':'')}>{value}</span>
   {caption&&<span className="sii-metric-caption">{caption}</span>}
   {href&&actionLabel&&<Link href={href as Route} className="sii-metric-link">{actionLabel}<span aria-hidden="true">↗</span></Link>}
 </article>;
}
export function SiiStatusPill({children,live=false}:{
 children:ReactNode;live?:boolean;
}){
 return <span className={live?'sii-badge sii-badge--live':'sii-badge sii-badge--muted'}>
   {live&&<span className="sii-online-dot"/>}{children}
 </span>;
}
export function SiiEmptyView({icon,title,description}:{
 icon:SiiNavIconName;title:string;description:string;
}){
 return <div className="sii-empty sii-kit-empty">
   <span className="sii-kit-empty-icon" aria-hidden="true"><SiiNavIcon name={icon}/></span>
   <strong>{title}</strong><p>{description}</p>
 </div>;
}
export function SiiModuleTile({title,description,icon,href,disabledReason}:{
 title:string;description:string;icon:SiiNavIconName;href?:string;disabledReason?:string;
}){
 const content=<>
   <span className="sii-module-glyph sii-kit-module-icon" aria-hidden="true"><SiiNavIcon name={icon}/></span>
   <h3>{title}</h3><p>{description}</p>
   <div className="sii-module-bottom"><span>{href?'Abrir módulo':disabledReason??'No disponible'}</span><span aria-hidden="true">{href?'↗':'·'}</span></div>
 </>;
 return href
 ? <Link href={href as Route} className="sii-module-card sii-kit-module-card">{content}</Link>
 : <article className="sii-module-card sii-kit-module-card sii-kit-module-card--disabled" aria-label={title+': '+(disabledReason??'No disponible')}>{content}</article>;
}
export function SiiSkeleton({label='Cargando contenido'}:{label?:string}){
 return <div className="sii-kit-skeleton" role="status" aria-label={label}>
   <span className="sii-kit-skeleton-block"/><span className="sii-kit-skeleton-block"/>
   <span className="sii-kit-skeleton-block"/>
   <span className="sii-kit-skeleton-label">{label}…</span>
 </div>;
}
