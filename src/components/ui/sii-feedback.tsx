import type {Ref} from 'react';

/**
 * Workspace feedback strip: offline notice, a focusable error alert and a status notice.
 * Keeps the class names and roles the existing screens and tests rely on.
 */
export function SiiFeedback({online=true,offlineMessage,error,errorId,errorRef,notice}:{
 online?:boolean;offlineMessage?:string;error?:string;errorId?:string;errorRef?:Ref<HTMLParagraphElement>;notice?:string;
}){
 return <>
  {!online&&offlineMessage&&<p className="sii-catalog-error" role="status">{offlineMessage}</p>}
  {error&&<p id={errorId} className="sii-catalog-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
  {notice&&<p className="sii-catalog-notice" role="status">{notice}</p>}
 </>;
}
