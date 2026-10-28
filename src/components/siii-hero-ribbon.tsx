import {useId} from 'react';

/** Decorative folds traced from the supplied composition; no information is rasterized. */
export default function SiiiHeroRibbon(){
 const id=useId().replaceAll(':','');
 return <svg className="siii-overview-watermark" viewBox="0 0 500 190" fill="none" aria-hidden="true" focusable="false">
  <defs><linearGradient id={id} x1="250" y1="0" x2="300" y2="190" gradientUnits="userSpaceOnUse"><stop stopColor="#ded1bc" stopOpacity=".24"/><stop offset=".45" stopColor="#cbbca7" stopOpacity=".08"/><stop offset="1" stopColor="#807465" stopOpacity=".02"/></linearGradient></defs>
  <path d="M0 190C105 83 233 1 383 4C438 5 475 15 500 26V104C425 70 346 66 273 105C225 131 195 161 168 190H0Z" fill={`url(#${id})`} stroke="#e4d7c1" strokeOpacity=".18"/>
  <path d="M0 190C114 133 170 101 242 122C323 146 391 164 500 172V190H0Z" fill={`url(#${id})`} stroke="#e4d7c1" strokeOpacity=".14"/>
  <path d="M135 190C255 145 345 71 441 52C465 47 485 48 500 52V190H135Z" fill={`url(#${id})`} stroke="#d8cbb5" strokeOpacity=".10"/>
 </svg>;
}
