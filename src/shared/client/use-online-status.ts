'use client';
import {useEffect,useState} from 'react';

/** Browser connectivity, shared by every workspace that disables writes while offline. */
export function useOnlineStatus(){
 const [online,setOnline]=useState(true);
 useEffect(()=>{
  const update=()=>setOnline(navigator.onLine);
  update();
  window.addEventListener('online',update);window.addEventListener('offline',update);
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[]);
 return online;
}
