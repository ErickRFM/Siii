import next from 'next';
import {createServer} from 'node:http';
const port=Number(process.env.SIII_TEST_PORT||3107);
const app=next({dev:true,hostname:'127.0.0.1',port});
await app.prepare();
const server=createServer(app.getRequestHandler());
server.listen(port,'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>app.close().finally(()=>process.exit(0))));
