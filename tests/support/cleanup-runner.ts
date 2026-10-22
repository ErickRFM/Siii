// IPC synchronizes test setup, not authorization or cleanup behavior.
import {assertApplicationRole,pool} from '../../src/infrastructure/database';
import {runCleanup} from '../../worker/session-cleanup';
await assertApplicationRole();
const start=new Promise<void>(resolve=>process.once('message',()=>resolve()));
process.send?.('ready');
await start;
try{await runCleanup();}finally{await pool.end();process.disconnect?.();}
