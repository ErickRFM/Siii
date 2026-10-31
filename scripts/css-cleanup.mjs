import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

/** Report possible orphans; never delete classes inferred unused from source text. */
const mode=process.argv.includes('--fix')?'fix':process.argv.includes('--check')?'check':'report';
function walk(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(dir,entry.name);
  return entry.isDirectory()?walk(file):entry.isFile()?[file]:[];
 });
}
const all=walk('src');
const styles=all.filter(f=>f.endsWith('.css')).sort();
const source=all.filter(f=>/\.(?:ts|tsx|js|jsx|mjs)$/.test(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');
const stats={files:styles.length,rules:0,duplicates:0,bytesBefore:0,bytesAfter:0};
const candidates=new Map();
for(const file of styles){
 const raw=fs.readFileSync(file,'utf8');stats.bytesBefore+=Buffer.byteLength(raw);
 const root=postcss.parse(raw,{from:file});
 const seen=new Map(),remove=new Set();
 root.walkRules(rule=>{
  stats.rules++;
  if(!rule.nodes?.every(n=>n.type==='decl'||n.type==='comment'))return;
  const decl=rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value,n.important]);
  if(!decl.length)return;
  const scope=[];
  for(let p=rule.parent;p&&p.type!=='root';p=p.parent){
   scope.unshift(p.type==='atrule'?'@'+p.name+' '+p.params.replace(/\s+/g,' '):'nested:'+p.toString().slice(0,50));
  }
  const signature=JSON.stringify([scope,rule.selector,decl]);
  if(seen.has(signature)){
   remove.add(seen.get(signature));
   stats.duplicates++;
   console.log('SAFE_DUPLICATE',file,rule.selector.slice(0,90),'scope='+scope.join('/'));
  }
  seen.set(signature,rule);
  for(const match of rule.selector.matchAll(/\.([a-zA-Z][\w-]*)/g)){
   const name=match[1];
   if(source.includes(name))continue;
   if(!candidates.has(name))candidates.set(name,new Set());
   candidates.get(name).add(file);
  }
 });
 if(mode==='fix'&&remove.size){
  for(const rule of remove)rule.remove();
  fs.writeFileSync(file,root.toString());
 }
 stats.bytesAfter+=mode==='fix'?fs.statSync(file).size:Buffer.byteLength(raw);
}
console.log('CSS_CLEANUP_SUMMARY',JSON.stringify({...stats,possibleOrphans:candidates.size,mode}));
console.log('CSS_ORPHANS_READ_ONLY',JSON.stringify([...candidates].slice(0,120).map(([name,files])=>({name,files:[...files]}))));
console.log('CSS_NOTE Orphan candidates may be dynamic selectors: verify behavior before deletion.');
if(mode==='check'&&stats.duplicates)process.exitCode=1;
