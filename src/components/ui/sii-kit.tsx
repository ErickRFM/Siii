import Link from 'next/link';
import type {Route} from 'next';
import type {ReactNode} from 'react';
import {SiiNavIcon,type SiiNavIconName} from '../sii-nav-icon';
import {Badge} from '@/components/ui/badge';
import {Card,CardContent} from '@/components/ui/card';
import {Empty,EmptyDescription,EmptyHeader,EmptyMedia,EmptyTitle} from '@/components/ui/empty';
import {cn} from '@/lib/utils';

/** Reusable presentation primitives. Server and client compatible; no permission decisions. */
export function SiiPageIntro({eyebrow,title,description,actions}:{
 eyebrow?:string;title:string;description?:string;actions?:ReactNode;hero?:boolean;
}){
 return <header data-slot="siii-page-intro" className="siii-v2-page-intro min-w-0">
   {eyebrow&&<div className="sii-page-eyebrow">{eyebrow}</div>}
   <div className="sii-page-heading sii-kit-page-heading flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0">
     <h1 aria-label={title.endsWith('.')?title:`${title}.`}>{title}</h1>
     {description&&<p>{description}</p>}
    </div>
    {actions&&<div className="siii-v2-page-actions flex min-w-0 shrink-0 flex-wrap gap-2">{actions}</div>}
   </div>
 </header>;
}
export function SiiSectionHeader({eyebrow,title,description,right,outside=false,workspace=false}:{
 eyebrow?:string;title:string;description?:string;right?:ReactNode;outside?:boolean;workspace?:boolean;
}){
 return <div className={'sii-panel-top sii-kit-section-header'+(outside?' sii-panel-top--outside':'')+(workspace?' sii-catalog-summary':'')+' flex flex-wrap items-center justify-between gap-3'}>
   <div className="min-w-0">{eyebrow&&<span className="sii-section-kicker">{eyebrow}</span>}<h2>{title}</h2>{description&&<p>{description}</p>}</div>{right}
 </div>;
}
export function SiiMetricTile({label,value,caption,description,icon,tone='rose',href,actionLabel,accessory,className}:{
 label:string;value:ReactNode;caption?:string;description?:ReactNode;icon?:SiiNavIconName|ReactNode;
 tone?:'rose'|'amber'|'blue'|'green'|'terracotta';href?:string;actionLabel?:string;accessory?:ReactNode;className?:string;
}){
 const toneClass={
  amber:'bg-amber-500/12 text-amber-800 dark:text-amber-300',
  blue:'bg-sky-500/12 text-sky-800 dark:text-sky-300',
  green:'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300',
  rose:'bg-primary-soft text-primary',
  terracotta:'bg-orange-500/12 text-orange-800 dark:text-orange-300',
 }[tone];
 return <Card className={cn('sii-metric sii-kit-metric sii-glass-role-metric siii-glass-surface overflow-hidden',className)}>
   <CardContent className="flex h-full w-full flex-col gap-1.5 p-4">
    <div className="flex items-center justify-between gap-2.5">
     <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</span>
     {icon&&<span className={'grid size-8 shrink-0 place-items-center rounded-lg '+toneClass} aria-hidden="true">{typeof icon==='string'?<SiiNavIcon name={icon as SiiNavIconName}/>:icon}</span>}
    </div>
    <span className={'sii-metric-value text-2xl font-bold tracking-tight tabular-nums'+(typeof value==='string'?' sii-metric-value--text':'')}>{value}</span>
    {description&&<div className="text-xs text-muted-foreground">{description}</div>}
    {caption&&<span className="sii-metric-caption text-xs text-muted-foreground">{caption}</span>}
    {accessory&&<div className="mt-0.5">{accessory}</div>}
    {href&&actionLabel&&<Link href={href as Route} className="sii-metric-link mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary hover:underline">{actionLabel}<span aria-hidden="true">↗</span></Link>}
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
export function SiiEmptyView({icon,title,description,action,className,actionContainerClassName}:{
 icon:SiiNavIconName;title:string;description:string;action?:ReactNode;
 className?:string;actionContainerClassName?:string;
}){
 return <Empty className={cn('sii-empty sii-kit-empty border',className)}>
   <EmptyHeader>
    <EmptyMedia variant="icon" className="sii-kit-empty-icon"><SiiNavIcon name={icon}/></EmptyMedia>
    <EmptyTitle className="sii-kit-empty-title">{title}</EmptyTitle>
    <EmptyDescription>{description}</EmptyDescription>
   </EmptyHeader>
   {action&&actionContainerClassName?<div className={actionContainerClassName}>{action}</div>:action}
 </Empty>;
}
export function SiiModuleTile({title,description,icon,href,disabledReason}:{
 title:string;description:string;icon:SiiNavIconName;href?:string;disabledReason?:string;
}){
 const content=<>
   <div className="flex items-center gap-3">
    <span className="sii-module-glyph sii-kit-module-icon grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden="true"><SiiNavIcon name={icon}/></span>
    <h3 className="m-0 text-sm font-bold tracking-tight">{title}</h3>
   </div>
   <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
   <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs font-semibold text-primary">
    <span>{href?'Abrir':disabledReason??'No disponible'}</span><span aria-hidden="true">{href?'→':'·'}</span>
   </div>
 </>;
 return href
  ? <Link href={href as Route} className="sii-module-card sii-kit-module-card sii-glass-role-module siii-glass-surface block rounded-xl border bg-card p-4 text-card-foreground transition hover:border-primary/50">{content}</Link>
  : <article className="sii-module-card sii-kit-module-card sii-kit-module-card--disabled block rounded-xl border border-dashed bg-card p-4 text-card-foreground" aria-label={title+': '+(disabledReason??'No disponible')}>{content}</article>;
}
export function SiiSkeleton({label='Cargando contenido'}:{label?:string}){
 return <div className="sii-kit-skeleton space-y-2.5" role="status" aria-label={label}>
   <span className="sii-kit-skeleton-block block h-16 animate-pulse rounded-xl bg-muted"/><span className="sii-kit-skeleton-block block h-16 animate-pulse rounded-xl bg-muted"/>
   <span className="sii-kit-skeleton-label text-xs text-muted-foreground">{label}…</span>
 </div>;
}
