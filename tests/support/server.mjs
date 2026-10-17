import next from 'next';
import {createServer} from 'node:http';
const port=Number(process.env.SIII_TEST_PORT||3107);
<<<<<<< HEAD
const app=next({dev:process.env.SIII_HTTP_TEST_PRODUCTION!=='1',hostname:'127.0.0.1',port});
=======
const app=next({dev:true,hostname:'127.0.0.1',port});
>>>>>>> integrate/sii-v1
await app.prepare();
const server=createServer(app.getRequestHandler());
server.listen(port,'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>app.close().finally(()=>process.exit(0))));
