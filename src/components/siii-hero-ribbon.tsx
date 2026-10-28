import {useId} from 'react';

/** Decorative folds traced from the supplied composition; no information is rasterized. */
export default function SiiiHeroRibbon(){
 const id=useId().replaceAll(':','');
 return <svg className="siii-overview-watermark" viewBox="0 0 500 190" fill="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id={id} x1="180" y1="22" x2="260" y2="190" gradientUnits="userSpaceOnUse"><stop stopColor="#e4d7c2" stopOpacity=".35"/><stop offset=".35" stopColor="#c9b8a0" stopOpacity=".15"/><stop offset="1" stopColor="#807465" stopOpacity=".02"/></linearGradient><linearGradient id={`${id}-fold`} x1="180" y1="90" x2="220" y2="190" gradientUnits="userSpaceOnUse"><stop stopColor="#eddfca" stopOpacity=".25"/><stop offset=".5" stopColor="#9c8b76" stopOpacity=".08"/><stop offset="1" stopColor="#5a5148" stopOpacity=".03"/></linearGradient></defs>
  <path d="M0 190C105 83 233 1 383 4C438 5 475 15 500 26V104C425 70 346 66 273 105C225 131 195 161 168 190H0Z" fill={`url(#${id})`} stroke="#e4d7c1" strokeOpacity=".18"/>
  <path d="M0 190C110 140 175 107 246 129C322 153 395 175 500 180V190H0Z" fill={`url(#${id}-fold)`} stroke="#e4d7c1" strokeOpacity=".14"/>
  <path d="M145 190C248 143 340 63 429 42C457 35 482 35 500 39V108C454 80 402 76 358 98C298 128 255 163 226 190H145Z" fill={`url(#${id}-fold)`} stroke="#d8cbb5" strokeOpacity=".12"/>
 </svg>;
}
