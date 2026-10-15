import {pool,assertApplicationRole} from '../src/infrastructure/database';
import {deliverInvitations} from '../src/shared/invitations/outbox-worker';
import {logger} from '../src/shared/logging';
async function main(){
 await assertApplicationRole();
 const totals=await deliverInvitations({limit:20});
 logger.info(totals,'Invitation delivery batch completed');
}
main().catch(()=>{logger.error({code:'INVITATION_DELIVERY_JOB_FAILED'},'Invitation batch failed');process.exitCode=1;}).finally(()=>pool.end());
