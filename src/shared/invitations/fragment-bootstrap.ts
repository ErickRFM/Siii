/** Runs before Next initializes its canonical URL or router cache. No bearer is serialized. */
export const invitationFragmentBootstrap = String.raw`(()=>{
 if(window.location.pathname!=='/invitations/accept')return;
 const replace=window.history.replaceState.bind(window.history);
 let pending=null;
 const capture=(initial=false)=>{
  if(window.location.pathname!=='/invitations/accept'||!window.location.hash)return;
  const fragment=new URLSearchParams(window.location.hash.slice(1));
  if(!fragment.has('id')&&!fragment.has('token'))return;
  const id=fragment.get('id'),token=fragment.get('token');
  pending=fragment.size===2&&fragment.getAll('id').length===1&&fragment.getAll('token').length===1&&id&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&token&&/^[A-Za-z0-9_-]{43}$/.test(token)?{invitationId:id,token}:null;
  replace(initial?null:window.history.state,'',window.location.pathname);
  window.dispatchEvent(new Event('siii:invitation-fragment'));
 };
 Object.defineProperty(window,'__siiiTakeInvitation',{value:()=>{const value=pending;pending=null;return value;},configurable:true});
 // Capture precedes Next's listeners, including same-document mail-link reopening.
 window.addEventListener('popstate',()=>capture(),true);
 window.addEventListener('hashchange',()=>capture(),true);
 capture(true);
})();`;

export type InvitationBearer={invitationId:string;token:string};
declare global {interface Window {__siiiTakeInvitation?:()=>InvitationBearer|null}}
