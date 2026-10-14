export function isolatedDatabaseUrl(env:Record<string,string|undefined>=process.env):string{
 if(env.SIII_DATABASE_ENV!=='test')throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
 const raw=env.INTEGRATION_DATABASE_URL??env.DATABASE_URL;
 if(!raw)throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
 let url:URL;try{url=new URL(raw);}catch{throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!(/^(p0_[a-z0-9_]+|[a-z0-9_]+_test)$/i).test(decodeURIComponent(url.pathname.slice(1))))throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('LOCAL_HTTP_TEST_DATABASE_REQUIRED');
 return raw;
}
