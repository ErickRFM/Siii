import next from 'next';
import {createServer} from 'node:http';
// Only this disposable HTTP harness can relay the fixed synthetic attendance host.
// Application modules never read this variable or accept a loopback production target.
if(process.env.SIII_TEST_ATTENDANCE_RELAY){
 const relay=process.env.SIII_TEST_ATTENDANCE_RELAY;
 if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/.test(relay)||process.env.SIII_DATABASE_ENV!=='test')throw Error('ATTENDANCE_TEST_RELAY_INVALID');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(input,init)=>String(input)==='https://companion-chain.invalid/integration/v1/attendance-history'
  ?originalFetch(relay+'/integration/v1/attendance-history',init):originalFetch(input,init);
}
const port=Number(process.env.SIII_TEST_PORT||3107);
const app=next({dev:process.env.SIII_HTTP_TEST_PRODUCTION!=='1',hostname:'127.0.0.1',port});
await app.prepare();
const handler=app.getRequestHandler();
const server=createServer((request,response)=>{response.setHeader('x-siii-test-instance',process.env.SIII_TEST_INSTANCE||'');return handler(request,response);});
server.on('error',()=>process.exit(1));
server.listen(port,'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>app.close().finally(()=>process.exit(0))));
