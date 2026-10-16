import {spawnSync} from 'node:child_process';
import setupServer from './http-setup';

// Exercise the production bundle, avoiding dev compilation in browser flows.
export default async function setup(){
 const build=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit',windowsHide:true});
 if(build.status!==0)throw new Error('UI_PRODUCTION_BUILD_FAILED');
 process.env.SIII_HTTP_TEST_PRODUCTION='1';
 return setupServer();
}
