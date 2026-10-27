import {pool,assertApplicationRole} from '../src/infrastructure/database';
import {deliverPasswordResets} from '../src/shared/password-reset/outbox-worker';
import {logger} from '../src/shared/logging';
async function main(){await assertApplicationRole();logger.info(await deliverPasswordResets({limit:20}),'Password reset delivery batch completed');}
main().catch(()=>{logger.error({code:'PASSWORD_RESET_JOB_FAILED'},'Password reset batch failed');process.exitCode=1;}).finally(()=>pool.end());
