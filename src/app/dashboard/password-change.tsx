'use client';
import { FormEvent,useState } from 'react';
import { useRouter } from 'next/navigation';
export default function PasswordChange(){
 const router=useRouter();const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setNotice('');const form=new FormData(e.currentTarget);
  try{const result=await fetch('/api/v1/auth/password/change',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({currentPassword:form.get('currentPassword'),newPassword:form.get('newPassword')})});
   if(!result.ok){setNotice('No se pudo actualizar la contraseña. Usa al menos 12 caracteres diferentes a la clave actual.');return}
   setNotice('Contraseña actualizada correctamente.');router.refresh();
  }catch{setNotice('No hay conexión con el servidor.')}finally{setBusy(false)}
 }
 return <form onSubmit={submit} className="password-form"><label>Contraseña actual<input required type="password" autoComplete="current-password" name="currentPassword"/></label><label>Nueva contraseña<input required type="password" autoComplete="new-password" minLength={12} name="newPassword"/></label><button type="submit" disabled={busy} className="primary-button">{busy?'Actualizando…':'Actualizar contraseña'}</button>{notice&&<p role="status">{notice}</p>}</form>
}
