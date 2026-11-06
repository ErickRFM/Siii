import type {ReactNode} from 'react';

/** Contextual actions: one consistent slot, never a second sidebar menu. */
export function SiiiDashboardActions({children,title='Operaciones principales'}:{
 children:ReactNode;title?:string;
}){
 return <nav className="siii-v2-action-dock" aria-label={title}>
  <div className="siii-v2-action-heading">
   <span>Acciones</span>
   <strong>{title}</strong>
  </div>
  <div className="siii-overview-shortcuts">{children}</div>
 </nav>;
}
