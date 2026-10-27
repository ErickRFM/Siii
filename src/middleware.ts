import {NextRequest,NextResponse} from 'next/server';
import {logger} from '@/shared/logging';
export function middleware(req:NextRequest){
 const id=crypto.randomUUID();
 const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
 const dev=process.env.NODE_ENV!=='production';
 const csp=[
  "default-src 'self'","script-src 'self' 'nonce-"+nonce+"' 'strict-dynamic'"+(dev?" 'unsafe-eval'":""),
  "style-src 'self' 'unsafe-inline'","img-src 'self' data:","font-src 'self'",
  "connect-src 'self'"+(dev?' ws: wss:':''),"object-src 'none'","base-uri 'self'",
  "form-action 'self'","frame-ancestors 'none'","worker-src 'self'"
 ].join('; ');
 const headers=new Headers(req.headers);
 headers.set('x-request-id',id);headers.set('x-nonce',nonce);headers.set('content-security-policy',csp);
 const response=NextResponse.next({request:{headers}});
 response.headers.set('x-request-id',id);response.headers.set('content-security-policy',csp);
 response.headers.set('x-content-type-options','nosniff');
 response.headers.set('referrer-policy','strict-origin-when-cross-origin');
 response.headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');
 response.headers.set('x-frame-options','DENY');
 if(!dev)response.headers.set('strict-transport-security','max-age=31536000; includeSubDomains');
 logger.info({requestId:id,method:req.method,path:req.nextUrl.pathname},'Request received');
 return response;
}
export const config={runtime:'nodejs',matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
