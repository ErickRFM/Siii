import {useId,type ReactNode} from 'react';

/** Visual-only ratio ring; value and labels are supplied by authorized read models. */
export function SiiiProgressRing({value,label,caption,size=98}:{value:number|null;label:string;caption?:ReactNode;size?:number}){
 const id='siii-progress-'+useId().replaceAll(':','');
 const known=typeof value==='number'&&Number.isFinite(value);
 const pct=known?Math.min(100,Math.max(0,value)):0;
 const r=39, circumference=2*Math.PI*r;
 return <div className="siii-ring" role="img" aria-label={label}>
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
   <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#9c7ad5"/><stop offset=".28" stopColor="#72a5eb"/><stop offset=".6" stopColor="#81d1b0"/><stop offset="1" stopColor="#d0ead8"/></linearGradient></defs>
   <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity=".13" strokeWidth="9"/>
   <circle cx="50" cy="50" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="9" strokeLinecap="round"
    strokeDasharray={circumference} strokeDashoffset={circumference*(1-pct/100)}
    transform="rotate(-90 50 50)" />
   <text x="50" y="55" textAnchor="middle" fill="currentColor" fontSize="19" fontWeight="500">{known?Math.round(pct)+'%':'—'}</text>
  </svg>
  {caption&&<div className="siii-ring-caption">{caption}</div>}
 </div>;
}
