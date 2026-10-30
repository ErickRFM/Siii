import {provisionQaAccounts} from '../src/modules/admin/qa-provisioning';
import {isolatedDatabaseUrl} from '../tests/support/database-url';

if (process.argv[1] && (process.argv[1].endsWith('provision-qa-accounts.ts') || process.argv[1].endsWith('provision-qa-accounts.mjs'))) {
  provisionQaAccounts(isolatedDatabaseUrl())
    .then(res => console.log(JSON.stringify({code: 'QA_ACCOUNTS_PROVISIONED', details: res}, null, 2)))
    .catch(err => {
      console.error(err);
      process.exitCode = 1;
    });
}
