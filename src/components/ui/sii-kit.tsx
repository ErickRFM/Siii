import Link from 'next/link';
import type {Route} from 'next';
import type {ReactNode} from 'react';
import {SiiNavIcon,type SiiNavIconName} from '../sii-nav-icon';
import {Badge} from '@/components/ui/badge';
import {Card,CardContent} from '@/components/ui/card';
import {Empty,EmptyDescription,EmptyHeader,EmptyMedia,EmptyTitle} from '@/components/ui/empty';

/** Reusable presentation primitives. Server and client compatible; no permission decisions. */
export function SiiPageIntro({eyebrow,title,description,actions,hero=false}:{
 eyebrow:string;title:string;description:string;actions?:ReactNode;hero?:boolean;
}){
 return <>
   <div className="sii-page-eyebrow">{eyebrow}<span className="sii-page-eyebrow-line"/></div>
   <div className={(hero?'sii-page-heading sii-kit-page-heading sii-kit-page-heading--hero':'sii-page-heading sii-kit-page-heading')+' flex flex-wrap items-start justify-between gap-4'}><div className="min-w-0">
     <h1>{title}<span className="sii-welcome-period">.</span></h1>
     <p>{description}</p>
   </div>{actions}</div>
 </>;
}
export function SiiSectionHeader({eyebrow,title,description,right,outside=false,workspace=false}:{
 eyebrow:string;title:string;description?:string;right?:ReactNode;outside?:boolean;workspace?:boolean;
}){
 return <div className={'sii-panel-top sii-kit-section-header'+(outside?' sii-panel-top--outside':'')+(workspace?' sii-catalog-summary':'')+' flex flex-wrap items-start justify-between gap-4'}>
   <div className="min-w-0"><span className="sii-section-kicker">{eyebrow}</span><h2>{title}</h2>{description&&<p>{description}</p>}</div>{right}
 </div>;
}
export function SiiMetricTile({label,value,caption,icon,tone='rose',href,actionLabel}:{
 label:string;value:ReactNode;caption?:string;icon:SiiNavIconName;tone?:'rose'|'amber'|'blue';href?:string;actionLabel?:string;
}){
 const toneClass=tone==='amber'?'bg-amber-500/10 text-amber-700 dark:text-amber-300':tone==='blue'?'bg-sky-500/10 text-sky-700 dark:text-sky-300':'bg-primary-soft text-primary';
 return <Card className="sii-metric sii-kit-metric overflow-hidden">
   <CardContent className="flex h-full flex-col gap-2 p-5">
    <div className="flex items-start justify-between gap-3">
     <span className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</span>
     <span className={'grid size-10 shrink-0 place-items-center rounded-xl '+toneClass} aria-hidden="true"><SiiNavIcon name={icon}/></span>
    </div>
    <span className={'sii-metric-value text-3xl font-bold tracking-tight'+(typeof value==='string'?' sii-metric-value--text':'')}>{value}</span>
    {caption&&<span className="sii-metric-caption text-xs text-muted-foreground">{caption}</span>}
    {href&&actionLabel&&<Link href={href as Route} className="sii-metric-link mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-primary">{actionLabel}<span aria-hidden="true">↗</span></Link>}
   </CardContent>
 </Card>;
}
export function SiiStatusPill({children,live=false}:{
 children:ReactNode;live?:boolean;
}){
 return <Badge variant={live?'default':'secondary'} className={live?'sii-badge sii-badge--live gap-1.5':'sii-badge sii-badge--muted gap-1.5'}>
   {live&&<span className="sii-online-dot"/>}{children}
 </Badge>;
}
export function SiiEmptyView({icon,title,description,action}:{
 icon:SiiNavIconName;title:string;description:string;action?:ReactNode;
}){
 return <Empty className="sii-empty sii-kit-empty border">
   <EmptyHeader>
    <EmptyMedia variant="icon" className="sii-kit-empty-icon"><SiiNavIcon name={icon}/></EmptyMedia>
    <EmptyTitle className="sii-kit-empty-title">{title}</EmptyTitle>
    <EmptyDescription>{description}</EmptyDescription>
   </EmptyHeader>
   {action}
 </Empty>;
}
export function SiiModuleTile({title,description,icon,href,disabledReason}:{
 title:string;description:string;icon:SiiNavIconName;href?:string;disabledReason?:string;
}){
 const content=<>
   <div className="flex items-start justify-between gap-3">
    <span className="sii-module-glyph sii-kit-module-icon grid size-11 place-items-center rounded-xl bg-primary-soft text-primary" aria-hidden="true"><SiiNavIcon name={icon}/></span>
   </div>
   <h3 className="mt-4 text-base font-bold tracking-tight">{title}</h3>
   <p className="mt-1.5 min-h-10 text-sm leading-relaxed text-muted-foreground">{description}</p>
   <div className="mt-5 flex items-center justify-between border-t pt-3 text-xs font-semibold text-primary">
    <span>{href?'Abrir módulo':disabledReason??'No disponible'}</span><span aria-hidden="true">{href?'↗':'·'}</span>
   </div>
 </>;
 return href
  ? <Link href={href as Route} className="sii-module-card sii-kit-module-card block rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">{content}</Link>
  : <article className="sii-module-card sii-kit-module-card sii-kit-module-card--disabled block rounded-xl border border-dashed bg-card p-5 text-card-foreground" aria-label={title+': '+(disabledReason??'No disponible')}>{content}</article>;
}
export function SiiSkeleton({label='Cargando contenido'}:{label?:string}){
 return <div className="sii-kit-skeleton space-y-3" role="status" aria-label={label}>
   <span className="sii-kit-skeleton-block block h-24 animate-pulse rounded-xl bg-muted"/><span className="sii-kit-skeleton-block block h-24 animate-pulse rounded-xl bg-muted"/>
   <span className="sii-kit-skeleton-block block h-24 animate-pulse rounded-xl bg-muted"/>
   <span className="sii-kit-skeleton-label text-sm text-muted-foreground">{label}…</span>
 </div>;
}
