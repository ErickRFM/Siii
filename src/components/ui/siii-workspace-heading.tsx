import type {ReactNode} from 'react';
import {cn} from '@/lib/utils';

/**
 * Shared heading for non-home institutional workspaces.
 * The role-specific shells own navigation; this component never creates tabs.
 */
export default function SiiiWorkspaceHeading({
 title,caption,action,level=1,className
}:{title:string;caption?:ReactNode;action?:ReactNode;level?:1|2;className?:string}){
 const titleClass='min-w-0 text-base font-semibold leading-tight tracking-tight text-foreground';
 return <header className={cn('siii-workspace-heading flex min-w-0 flex-wrap items-center justify-between gap-3 pb-1',className)}>
  <div className="min-w-0 space-y-1">
   {level===1?<h1 className={titleClass}>{title}</h1>:<h2 className={titleClass}>{title}</h2>}
   {caption&&<div className="text-xs leading-relaxed text-muted-foreground">{caption}</div>}
  </div>
  {action&&<div className="flex shrink-0 items-center gap-2">{action}</div>}
 </header>;
}
