// Capture and remove the email bearer before Next caches/canonicalizes the URL.
export const applicantFragmentBootstrap=String.raw`(()=>{
 if(window.location.pathname!=='/admissions/verify')return;
 let pending=null;
 const capture=()=>{
  if(window.location.pathname!=='/admissions/verify'||!window.location.hash)return;
  const fragment=new URLSearchParams(window.location.hash.slice(1)),id=fragment.get('id'),token=fragment.get('token');
  pending=fragment.size===2&&fragment.getAll('id').length===1&&fragment.getAll('token').length===1&&id&&/^[0-9a-f-]{36}$/i.test(id)&&token&&/^[A-Za-z0-9_-]{43}$/.test(token)?{id,token}:null;
  window.history.replaceState(null,'',window.location.pathname);
  window.dispatchEvent(new Event('siii:applicant-fragment'));
 };
 Object.defineProperty(window,'__siiiTakeApplicantProof',{value:()=>{const value=pending;pending=null;return value;},configurable:true});
 window.addEventListener('hashchange',capture,true);window.addEventListener('popstate',capture,true);capture();
})();`;
export type ApplicantProof={id:string;token:string};
declare global {interface Window {__siiiTakeApplicantProof?:()=>ApplicantProof|null}}
