'use client';

import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {Button} from '@/components/ui/button';

type Theme='light'|'dark';
export default function SiiThemeToggle(){
 const [theme,setTheme]=useState<Theme>('dark');
 useEffect(()=>{
  try{
   const saved=window.localStorage.getItem('sii-theme');
   const resolved:Theme=saved==='light'?'light':'dark';
   document.documentElement.dataset.siiTheme=resolved;
   setTheme(resolved);
  }catch{
   document.documentElement.dataset.siiTheme='dark';
  }
 },[]);
 const toggle=()=>{
  const next:Theme=theme==='light'?'dark':'light';
  setTheme(next);
  document.documentElement.dataset.siiTheme=next;
  try{window.localStorage.setItem('sii-theme',next);}catch{/* Optional preference. */}
 };
 return <Button className="sii-theme-toggle" variant="outline" size="icon" type="button" onClick={toggle}
  aria-label={theme==='light'?'Activar tema oscuro':'Activar tema claro'} title={theme==='light'?'Tema oscuro':'Tema claro'}>
  {theme==='light'?<Moon/>:<Sun/>}
 </Button>;
}
