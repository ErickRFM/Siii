import {createHash} from 'node:crypto';

/** Opaque response binding, never a session credential. */
export function attendanceSession(identity:{id:string;sessionId:string}){
 return createHash('sha256').update(identity.id+':'+identity.sessionId).digest('hex');
}
