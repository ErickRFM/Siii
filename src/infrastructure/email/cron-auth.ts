import {timingSafeEqual} from 'node:crypto';

/** Constant-time comparison for a dedicated high-entropy server-only cron secret. */
export function cronAuthorized(header:string|null,secret:string|undefined):boolean {
 if(!secret||secret.length<32||!header)return false;
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
