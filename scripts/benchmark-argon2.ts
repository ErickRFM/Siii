/**
 * Offline/native Argon2 laboratory. NO HTTP/SQL/real credentials.
 * --help / --dry-run never generate passwords, hashes or measurements.
 * --run requires approved Linux Node 24, cgroup v2 1 CPU / 1 GiB.
 */
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

const CAPS = { seconds:180, operations:512, worstCaseNativeCalls:1024, concurrency:8,
  operationTimeoutMs:15000, rssBytes:768*1024*1024, samplePeriodMs:20 } as const;
type Options = { mode:'help'|'dry-run'|'run'; approved:boolean; saturation:boolean; operations:number; warmup:number; seconds:number; output:string };
function rejected(code:string):never { throw new Error(code); }
export function parseBenchmarkArgs(args:string[]):Options {
  const options:Options={mode:'help',approved:false,saturation:false,operations:24,warmup:2,seconds:120,output:'argon2-lab-report.json'};
  const seen=new Set<string>();
  for(let i=0;i<args.length;i++){
    const key=args[i]; if(seen.has(key))rejected('ARGON2_BENCHMARK_ARGUMENTS'); seen.add(key);
    if(['--help','--dry-run','--run'].includes(key)){options.mode=key.slice(2) as Options['mode'];continue;}
    if(key==='--approved-representative'){options.approved=true;continue;}
    if(key==='--saturation-8'){options.saturation=true;continue;}
    if(!['--operations','--warmup','--runtime-seconds','--output'].includes(key)||!args[i+1])rejected('ARGON2_BENCHMARK_ARGUMENTS');
    const value=args[++i];
    if(key==='--output'){if(!value||value.includes('\0'))rejected('ARGON2_BENCHMARK_ARGUMENTS');options.output=value;continue;}
    if(!/^[0-9]+$/.test(value))rejected('ARGON2_BENCHMARK_ARGUMENTS');
    const n=Number(value);
    if(key==='--operations'){if(n<1||n>32)rejected('ARGON2_BENCHMARK_ARGUMENTS');options.operations=n;}
    if(key==='--warmup'){if(n<1||n>4)rejected('ARGON2_BENCHMARK_ARGUMENTS');options.warmup=n;}
    if(key==='--runtime-seconds'){if(n<15||n>CAPS.seconds)rejected('ARGON2_BENCHMARK_ARGUMENTS');options.seconds=n;}
  }
  if(['--help','--dry-run','--run'].filter(flag=>seen.has(flag)).length>1)rejected('ARGON2_BENCHMARK_ARGUMENTS');
  return options;
}
export function latencySummary(values:number[]){
  if(values.some(n=>!Number.isFinite(n)||n<0))rejected('ARGON2_LATENCY_INVALID');
  const sorted=[...values].sort((a,b)=>a-b);
  const percentile=(p:number)=>sorted.length?sorted[Math.max(0,Math.ceil(p*sorted.length)-1)]:null;
  return {samples:sorted.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:sorted.at(-1)??null};
}
export function assertRepresentativePlatform(platform:string,node:string,approval:boolean):void{
  if(platform!=='linux'||node.split('.')[0]!=='24'||!approval)rejected('LINUX_NODE24_APPROVAL_REQUIRED');
}
type Cgroup={version:2;cpuQuotaUs:number;cpuPeriodUs:number;cpuLimit:number;memoryMaxBytes:number;memoryCurrentBytes:number;memoryPeakBytes:number|null;cpuUsageUs:number|null;cpuStat:Record<string,number>|null};
function cgroup():Cgroup {
  try{
    const read=(name:string)=>readFileSync('/sys/fs/cgroup/'+name,'utf8').trim();
    const [quota,period]=read('cpu.max').split(/\s+/).map(Number);
    const memory=Number(read('memory.max')),current=Number(read('memory.current'));
    if(!Number.isFinite(quota)||!Number.isFinite(period)||period<=0||quota<=0||!Number.isFinite(memory)||memory<=0)rejected('FINITE_CGROUP_V2_LIMITS_REQUIRED');
    let peak:number|null=null,usage:number|null=null,cpuStat:Record<string,number>|null=null;
    try{peak=Number(read('memory.peak'));}catch{/* optional older kernel */}
    try{
      const allowed=['usage_usec','user_usec','system_usec','nr_periods','nr_throttled','throttled_usec','nr_bursts','burst_usec'];
      cpuStat=Object.fromEntries(read('cpu.stat').split('\n').map(line=>line.trim().split(/\s+/)).filter(([key,value])=>allowed.includes(key)&&/^\d+$/.test(value??'')).map(([key,value])=>[key,Number(value)]));
      usage=cpuStat.usage_usec??null;
    }catch{/* optional telemetry */}
    return {version:2,cpuQuotaUs:quota,cpuPeriodUs:period,cpuLimit:quota/period,memoryMaxBytes:memory,memoryCurrentBytes:current,memoryPeakBytes:peak,cpuUsageUs:usage,cpuStat};
  }catch(error){if(error instanceof Error&&error.message==='FINITE_CGROUP_V2_LIMITS_REQUIRED')throw error;return rejected('CGROUP_V2_METADATA_REQUIRED');}
}
function safeVersion(value:unknown):string|null {return typeof value==='string'&&/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value)?value:null;}
function provenance(){
  const require=createRequire(import.meta.url);
  const argon=JSON.parse(readFileSync(require.resolve('argon2/package.json'),'utf8')) as {version?:unknown};
  const digest=(path:string)=>createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
  const commit=process.env.SIII_ARGON2_SOURCE_SHA;
  const image=process.env.SIII_ARGON2_IMAGE_DIGEST;
  return {node:process.version,libuv:process.versions.uv,napi:process.versions.napi,
    platform:process.platform,architecture:process.arch,kernel:os.release(),availableParallelism:os.availableParallelism(),
    argon2Package:safeVersion(argon.version),uvThreadpoolSize:4,
    sourceCommit:commit&&/^[a-f0-9]{40}$/.test(commit)?commit:null,
    containerImageDigest:image&&/^sha256:[a-f0-9]{64}$/.test(image)?image:null,
    passwordHelperSourceSha256:digest('src/shared/auth/password.ts'),lockfileSha256:digest('package-lock.json')};
}
type CaseName='verify_valid'|'verify_invalid'|'verify_dummy'|'password_change_native';
type Result={case:CaseName;concurrency:number;requested:number;completed:number;errors:number;durationMs:number;latency:ReturnType<typeof latencySummary>;cpuUserMs:number;cpuSystemMs:number;peakSampledRssBytes:number;maxInFlight:number};
async function benchmark(options:Options){
  assertRepresentativePlatform(process.platform,process.versions.node,options.approved&&process.env.SIII_ARGON2_LAB_APPROVED==='1');
  if(process.env.UV_THREADPOOL_SIZE&&process.env.UV_THREADPOOL_SIZE!=='4')rejected('REPRESENTATIVE_UV_THREADPOOL_REQUIRED');
  const limits=cgroup();
  if(Math.abs(limits.cpuLimit-1)>0.000001||limits.memoryMaxBytes!==1024*1024*1024)rejected('APPROVED_ONE_CPU_ONE_GIB_PROFILE_REQUIRED');
  // Dynamic imports happen only after all authorization/platform/resource guards.
  const {ARGON2_OPTIONS,hashPassword,verifyPassword}=await import('../src/shared/auth/password');
  const argon2=(await import('argon2')).default;
  if(ARGON2_OPTIONS.memoryCost!==65536||ARGON2_OPTIONS.timeCost!==3||ARGON2_OPTIONS.parallelism!==1||ARGON2_OPTIONS.hashLength!==32||ARGON2_OPTIONS.type!==argon2.argon2id)rejected('ARGON2_PARAMS_DRIFT');
  const started=performance.now(),initialCpu=process.cpuUsage();
  const cases:CaseName[]=['verify_valid','verify_invalid','verify_dummy','password_change_native'];
  const state={operations:0,worstCaseNativeCalls:0,inFlight:0,maxInFlight:0,peakRss:process.memoryUsage.rss(),stop:null as string|null};
  const results:Result[]=[];
  const report={kind:'SIII_ARGON2_NATIVE_LAB',scope:'native_component_only',status:'running',
    approvalDeclared:true,productionHostingValidated:false,
    params:{algorithm:'argon2id',version:19,memoryCostKiB:65536,timeCost:3,parallelism:1,hashLength:32},
    hardCaps:CAPS,provenance:provenance(),cgroupStart:limits,cgroupEnd:null as Cgroup|null,
    rssSamplePeriodMs:CAPS.samplePeriodMs,quantileMethod:'nearest_rank',warmupPerCase:options.warmup,
    operationsPerCase:options.operations,mandatoryConcurrencies:[1,2,4],
    saturation8:{requested:options.saturation,performed:false,skipReason:null as string|null},
    setupFunctionalChecks:false,results,durationMs:0,cpuUserMs:0,cpuSystemMs:0,
    peakSampledRssBytes:state.peakRss,kernelMaxRssBytes:0,
    operationsCharged:0,worstCaseNativeCallsReserved:0,maxInFlight:0,errors:0,stopReason:null as string|null};
  const save=(status:string)=>{
    report.status=status; report.durationMs=performance.now()-started;
    const cpu=process.cpuUsage(initialCpu);report.cpuUserMs=cpu.user/1000;report.cpuSystemMs=cpu.system/1000;
    report.peakSampledRssBytes=state.peakRss;report.kernelMaxRssBytes=process.resourceUsage().maxRSS*1024;
    report.operationsCharged=state.operations;report.worstCaseNativeCallsReserved=state.worstCaseNativeCalls;
    report.maxInFlight=state.maxInFlight;report.errors=results.reduce((n,r)=>n+r.errors,0)||(state.stop?1:0);report.stopReason=state.stop;
    try{report.cgroupEnd=cgroup();}catch{/* never erase partial evidence */}
    writeFileSync(resolve(options.output),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  };
  const forceStop=(reason:string,code:number)=>{
    state.stop=reason;
    try{save('aborted');}catch{/* exit code remains failure when report cannot be saved */}
    console.error('ARGON2_LAB_ABORTED');process.exit(code);
  };
  const sampler=setInterval(()=>{
    const rss=process.memoryUsage.rss();state.peakRss=Math.max(state.peakRss,rss);
    if(rss>CAPS.rssBytes)forceStop('RSS_HARD_CAP',2);
  },CAPS.samplePeriodMs);
  const watchdog=setTimeout(()=>forceStop('RUNTIME_HARD_CAP',124),options.seconds*1000);
  const reserve=(worstNative:number)=>{
    if(state.stop)rejected('WORKLOAD_STOPPED');
    if(state.operations+1>CAPS.operations||state.worstCaseNativeCalls+worstNative>CAPS.worstCaseNativeCalls)rejected('OPERATIONS_HARD_CAP');
    state.operations++;state.worstCaseNativeCalls+=worstNative;
  };
  let password:string|undefined,invalid:string|undefined,replacement:string|undefined,validHash:string|undefined;
  try{
    // None of these values are accepted as arguments, written, logged, or serialized.
    password=randomBytes(32).toString('base64url');invalid=randomBytes(32).toString('base64url');replacement=randomBytes(32).toString('base64url');
    reserve(1);validHash=await hashPassword(password);
    const encoded=validHash.split('$');
    const encodedCosts=Object.fromEntries((encoded[3]??'').split(',').map(pair=>pair.split('=')));
    if(encoded[1]!=='argon2id'||encoded[2]!=='v=19'||Object.keys(encodedCosts).length!==3||encodedCosts.m!=='65536'||encodedCosts.t!=='3'||encodedCosts.p!=='1'||Buffer.from(encoded[5]??'','base64').length!==32)rejected('FUNCTIONAL_RESULT_MISMATCH');
    reserve(2);if(!await verifyPassword(validHash,password))rejected('FUNCTIONAL_RESULT_MISMATCH');
    reserve(2);if(await verifyPassword(validHash,invalid))rejected('FUNCTIONAL_RESULT_MISMATCH');
    reserve(2);if(await verifyPassword(null,invalid))rejected('FUNCTIONAL_RESULT_MISMATCH');
    reserve(1);const changed=await hashPassword(replacement);
    reserve(2);if(!await verifyPassword(changed,replacement)||argon2.needsRehash(changed,ARGON2_OPTIONS))rejected('FUNCTIONAL_RESULT_MISMATCH');
    reserve(2);if(await verifyPassword(changed,password))rejected('FUNCTIONAL_RESULT_MISMATCH');
    report.setupFunctionalChecks=true;
    const operation=async(name:CaseName)=>{
      reserve(name==='password_change_native'?3:2);
      if(name==='verify_valid'){if(!await verifyPassword(validHash,password!))rejected('FUNCTIONAL_RESULT_MISMATCH');}
      if(name==='verify_invalid'){if(await verifyPassword(validHash,invalid!))rejected('FUNCTIONAL_RESULT_MISMATCH');}
      if(name==='verify_dummy'){if(await verifyPassword(null,invalid!))rejected('FUNCTIONAL_RESULT_MISMATCH');}
      if(name==='password_change_native'){
        if(!await verifyPassword(validHash,password!))rejected('FUNCTIONAL_RESULT_MISMATCH');
        if(state.stop)rejected('WORKLOAD_STOPPED');
        const digest=await hashPassword(replacement!);
        if(argon2.needsRehash(digest,ARGON2_OPTIONS))rejected('FUNCTIONAL_RESULT_MISMATCH');
        // Verification of the replacement and rejection of the old password are
        // setup checks. Timed change component is old verify + new hash only.
      }
    };
    const timed=async(name:CaseName)=>{
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{
        await Promise.race([operation(name),new Promise<never>((_,reject)=>{
          timer=setTimeout(()=>{state.stop='OPERATION_TIMEOUT';reject(new Error('OPERATION_TIMEOUT'));},CAPS.operationTimeoutMs);
        })]);
      }finally{if(timer)clearTimeout(timer);}
    };
    for(const name of cases)for(let i=0;i<options.warmup;i++)await timed(name);
    const runGroup=async(concurrency:number)=>{
      for(const name of cases){
        if(state.stop)break;
        let next=0,errors=0,inFlight=0,maxInFlight=0;
        const values:number[]=[],begin=performance.now(),cpu=process.cpuUsage();
        let peak=process.memoryUsage.rss();
        const sample=setInterval(()=>{peak=Math.max(peak,process.memoryUsage.rss());},CAPS.samplePeriodMs);
        try{
          await Promise.all(Array.from({length:concurrency},async()=>{
            while(!state.stop&&next<options.operations){
              next++;const start=performance.now();inFlight++;state.inFlight++;
              maxInFlight=Math.max(maxInFlight,inFlight);state.maxInFlight=Math.max(state.maxInFlight,state.inFlight);
              try{await timed(name);values.push(performance.now()-start);}
              catch{errors++;state.stop??='OPERATION_FAILED';}
              finally{inFlight--;state.inFlight--;}
            }
          }));
        }finally{clearInterval(sample);}
        const used=process.cpuUsage(cpu);
        results.push({case:name,concurrency,requested:options.operations,completed:values.length,errors,durationMs:performance.now()-begin,
          latency:latencySummary(values),cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,peakSampledRssBytes:peak,maxInFlight});
      }
    };
    for(const concurrency of [1,2,4])await runGroup(concurrency);
    if(options.saturation&&!state.stop){
      const reserveOperations=options.operations*4,reserveNative=options.operations*9;
      const recentCpu=process.cpuUsage(initialCpu),remaining=options.seconds*1000-(performance.now()-started);
      const slowestGroup=Math.max(...results.map(r=>r.durationMs),1000);
      // Allow bounded queue saturation only with conservative worst-case native
      // memory, CPU-time and wall-time headroom. Never change Argon2 parameters.
      if(state.operations+reserveOperations>CAPS.operations||state.worstCaseNativeCalls+reserveNative>CAPS.worstCaseNativeCalls)report.saturation8.skipReason='operation_budget';
      else if(process.memoryUsage.rss()+Math.min(8,4)*65536*1024>CAPS.rssBytes)report.saturation8.skipReason='rss_budget';
      else if((recentCpu.user+recentCpu.system)/1000>options.seconds*1000*.7||remaining<slowestGroup*6)report.saturation8.skipReason='cpu_or_runtime_budget';
      else{report.saturation8.performed=true;await runGroup(8);}
    }
    save(state.stop?'failed':'complete');
    console.log('ARGON2_LAB_REPORT_WRITTEN status='+report.status);
    if(state.stop)process.exitCode=1;
  }catch{
    state.stop??='SETUP_OR_WORKLOAD_FAILED';save('failed');console.error('ARGON2_LAB_FAILED');process.exitCode=1;
  }finally{
    clearInterval(sampler);clearTimeout(watchdog);
    // Drop references, never expose synthetic credential material.
    password=undefined;invalid=undefined;replacement=undefined;validHash=undefined;
    // Timed-out native work cannot be cancelled: terminate without scheduling
    // replacements, so maximum queued/in-flight native operations stays bounded.
    if(state.stop==='OPERATION_TIMEOUT')process.exit(124);
  }
}
async function main(){
  const options=parseBenchmarkArgs(process.argv.slice(2));
  if(options.mode==='help'){
    console.log('LOCAL_ONLY help; zero native hashing. --dry-run | --run --approved-representative [--saturation-8] [--operations 1..32] [--warmup 1..4] [--runtime-seconds 15..180] [--output report.json]');
    return;
  }
  if(options.mode==='dry-run'){
    console.log(JSON.stringify({kind:'LOCAL_ONLY_ARGON2_DRY_RUN',measurementsPerformed:false,params:{memoryCostKiB:65536,timeCost:3,parallelism:1,hashLength:32},hardCaps:CAPS,mandatoryConcurrencies:[1,2,4],saturation8Requested:options.saturation,operationsPerCase:options.operations,warmupPerCase:options.warmup,runtimeSeconds:options.seconds}));
    return;
  }
  await benchmark(options);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{
    const safe=new Set(['ARGON2_BENCHMARK_ARGUMENTS','LINUX_NODE24_APPROVAL_REQUIRED','REPRESENTATIVE_UV_THREADPOOL_REQUIRED','FINITE_CGROUP_V2_LIMITS_REQUIRED','CGROUP_V2_METADATA_REQUIRED','APPROVED_ONE_CPU_ONE_GIB_PROFILE_REQUIRED','ARGON2_PARAMS_DRIFT']);
    console.error(error instanceof Error&&safe.has(error.message)?error.message:'ARGON2_LAB_REJECTED');process.exitCode=1;
  });
}

