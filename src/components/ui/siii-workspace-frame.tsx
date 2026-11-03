import type {ReactNode} from 'react';
import {cn} from '@/lib/utils';
import SiiiWorkspaceHeading from './siii-workspace-heading';

/**
 * SIII workspace scaffold, adapted from the MIT-licensed Kiranism
 * next-shadcn-dashboard-starter PageContainer (Copyright 2023 Kiranism).
 * See docs/design/SIII_V2_OPEN_SOURCE_SOURCES.md for attribution.
 * Keeps the page header, action, loading and content in predictable regions.
 * Does not perform permission checks: all access remains enforced by the caller.
 */
export function SiiiWorkspaceFrame({
 children,title,caption,action,loading=false,className
}:{
 children:ReactNode;title?:string;caption?:ReactNode;action?:ReactNode;
 loading?:boolean;className?:string;
}){
 return <div data-slot="siii-workspace-frame" className={cn('siii-workspace-frame flex min-w-0 flex-col gap-4',className)}>
  {title&&<SiiiWorkspaceHeading title={title} caption={caption} action={action}/>}
  {loading
   ?<div role="status" aria-live="polite" aria-label="Cargando vista institucional" className="siii-workspace-loading min-h-24">
     <span className="sr-only">Consultando información institucional…</span>
     <div aria-hidden="true" className="siii-workspace-loading-line h-5 w-40 rounded-md bg-muted"/>
     <div aria-hidden="true" className="siii-workspace-loading-line h-4 w-64 max-w-full rounded-md bg-muted"/>
    </div>
   :null}
  {children}
 </div>;
}
