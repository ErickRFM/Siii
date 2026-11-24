'use client';

import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {Button} from '@/components/ui/button';

type Theme='light'|'dark';

/**
 * Applies the theme without animating colors: hover/focus `transition-colors`
 * would otherwise interpolate text between both palettes, briefly dropping
 * below WCAG AA (and axe samples that intermediate frame).
 */
function applyTheme(next:Theme){
 const root=document.documentElement;
 const freeze=document.createElement('style');
 freeze.setAttribute('data-sii-theme-freeze','');
 freeze.textContent='*,*::before,*::after{transition:none!important}';
 document.head.appendChild(freeze);
 root.dataset.siiTheme=next;
 // Force style recalculation so final colors are committed before transitions return.
 void window.getComputedStyle(root).color;
 requestAnimationFrame(()=>requestAnimationFrame(()=>freeze.remove()));
}

export default function SiiThemeToggle({defaultTheme='light'}:{defaultTheme?:Theme}){
 const [theme,setTheme]=useState<Theme>('light');
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  try{
   const saved=window.localStorage.getItem('sii-theme');
   const resolved:Theme=saved==='dark'?'dark':saved==='light'?'light':defaultTheme;
   document.documentElement.dataset.siiTheme=resolved;
   setTheme(resolved);
  }catch{
   document.documentElement.dataset.siiTheme=defaultTheme;setTheme(defaultTheme);
  }
  setReady(true);
 },[defaultTheme]);
 const toggle=()=>{
  const next:Theme=theme==='light'?'dark':'light';
  setTheme(next);
  applyTheme(next);
  try{window.localStorage.setItem('sii-theme',next);}catch{/* Optional preference. */}
 };
 return <Button className="sii-theme-toggle" variant="outline" size="icon" type="button" onClick={toggle} style={{visibility:ready?'visible':'hidden'}}
  aria-label={theme==='light'?'Activar tema oscuro':'Activar tema claro'} title={theme==='light'?'Tema oscuro':'Tema claro'}>
  {theme==='light'?<Moon/>:<Sun/>}
 </Button>;
}
