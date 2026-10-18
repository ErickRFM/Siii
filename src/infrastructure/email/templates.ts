import type {TransactionalEmail} from './transactional';

/** HTML is derived only at the delivery boundary. Persisted, encrypted text and
 * idempotency payloads remain compatible with already queued messages. */
export type MailPurpose='invitation'|'password-reset';
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const BRAND='Siii — Sistema Institucional Integral';
const titleFor=(purpose:MailPurpose)=>purpose==='invitation'?'Invitación institucional':'Recuperación de contraseña';
const actionFor=(purpose:MailPurpose)=>purpose==='invitation'?'Revisar invitación':'Restablecer contraseña';
function trustedActionUrl(message:TransactionalEmail,purpose:MailPurpose):string|null {
 const candidate=message.text.match(/https:\/\/[^\s<>"']+/)?.[0];
 if(!candidate)return null;
 try {
  const url=new URL(candidate);
  const expected=purpose==='invitation'?'/invitations/accept':'/password/reset';
  const token=new URLSearchParams(url.hash.slice(1));
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!==expected||url.search||token.get('id')===null||!/^[A-Za-z0-9_-]{43}$/.test(token.get('token')??''))return null;
  return url.toString();
 }catch{return null;}
}
function expiry(message:TransactionalEmail):string|null {
 const dateText=message.text.match(/(?:vence|expira):\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/i)?.[1];
 if(!dateText)return null;
 const date=new Date(dateText);
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'}).format(date)+' UTC':null;
}
/** All dynamic content is HTML-escaped. No scripts, remote fonts, tracking pixels or externally hosted logos. */
export function renderSiiiEmailHtml(message:TransactionalEmail,purpose:MailPurpose):string {
 const invitation=purpose==='invitation',title=titleFor(purpose),url=trustedActionUrl(message,purpose),until=expiry(message);
 const messageText=invitation
  ? 'Recibiste una invitación para participar en el Sistema Institucional Integral. Revisa el perfil y el ámbito antes de aceptar voluntariamente el acceso.'
  : 'Se solicitó restablecer la contraseña de tu cuenta institucional. Solo tú puedes confirmar esta solicitud y elegir una nueva contraseña.';
 const instruction=invitation
  ? 'Antes de aceptar, confirma que reconoces la institución, el perfil y la duración del acceso.'
  : 'El enlace es personal y de un solo uso. Si tu cuenta tiene autenticación de dos factores, también se te solicitará verificarla.';
 const ignore=invitation?'Si no esperabas esta invitación, puedes ignorar este mensaje o rechazarla desde el enlace.':'Si no solicitaste el restablecimiento, ignora este mensaje. Tu contraseña actual no cambiará.';
 const button=url?'<tr><td style="padding:26px 0 18px;text-align:left"><a href="'+escapeHtml(url)+'" style="display:inline-block;padding:15px 23px;border-radius:11px;background:#8d2143;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px">'+escapeHtml(actionFor(purpose))+' &rarr;</a></td></tr>':'';
 const fallback=url?'<tr><td style="padding:0 0 20px;font-size:12px;color:#626775;line-height:1.6">Si el botón no funciona, copia esta dirección en el navegador:<br><a href="'+escapeHtml(url)+'" style="color:#8d2143;overflow-wrap:anywhere;word-break:break-all">'+escapeHtml(url)+'</a></td></tr>':'';
 const expiration=until?'<tr><td style="padding:12px 16px;background:#f7f0f3;border-radius:10px;color:#702641;font-size:13px;line-height:1.6"><strong>Vigencia del enlace:</strong> '+escapeHtml(until)+'</td></tr>':'';
 return [
 '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>',escapeHtml(title),'</title></head>',
 '<body style="margin:0;padding:0;background:#f4f4f7;color:#1c2635;font-family:Arial,Helvetica,sans-serif">',
 '<div style="display:none;max-height:0;overflow:hidden;opacity:0">',escapeHtml(messageText),'</div>',
 '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f4f7"><tr><td align="center" style="padding:40px 14px">',
 '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e8e3e7;border-radius:18px;overflow:hidden">',
 '<tr><td style="background:#4b172e;padding:26px 34px;color:#ffffff"><table role="presentation" width="100%"><tr><td style="font-size:29px;letter-spacing:1px;font-weight:800">SIII</td><td style="text-align:right;color:#f1dce4;font-size:11px;line-height:1.5">SISTEMA INSTITUCIONAL<br>INTEGRAL</td></tr></table></td></tr>',
 '<tr><td style="padding:34px 34px 30px"><table role="presentation" width="100%">',
 '<tr><td style="color:#a52a52;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding-bottom:12px">NOTIFICACIÓN INSTITUCIONAL</td></tr>',
 '<tr><td style="font-size:27px;font-weight:800;letter-spacing:-.6px;line-height:1.25;padding-bottom:14px">',escapeHtml(title),'</td></tr>',
 '<tr><td style="font-size:15px;color:#475368;line-height:1.7">',escapeHtml(messageText),'</td></tr>',
 button,fallback,expiration,
 '<tr><td style="padding:22px 0 0;font-size:13px;color:#475368;line-height:1.7">',escapeHtml(instruction),'</td></tr>',
 '<tr><td style="padding-top:18px;font-size:13px;color:#475368;line-height:1.7">',escapeHtml(ignore),'</td></tr>',
 '</table></td></tr>',
 '<tr><td style="padding:21px 34px;background:#faf8f9;border-top:1px solid #eee8eb;font-size:12px;line-height:1.7;color:#697183">',
 '<strong style="color:#4b172e">',BRAND,'</strong><br>',
 'Este mensaje se generó automáticamente por una operación de seguridad o acceso institucional. No respondas con contraseñas, códigos MFA ni claves de recuperación.',
 '</td></tr></table></td></tr></table></body></html>'
 ].join('');
}
