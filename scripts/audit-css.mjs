// Read-only audit: candidates require review of dynamically generated classes.
import {readdirSync,readFileSync,appendFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import postcss from 'postcss';
const walk=(dir,suffixes)=>{
 const result=[];
 for(const item of readdirSync(dir,{withFileTypes:true})){
  if(item.name.startsWith('.')||item.name==='node_modules')continue;
  const path=join(dir,item.name);
  if(item.isDirectory())result.push(...walk(path,suffixes));
  else if(suffixes.some(ext=>path.endsWith(ext)))result.push(path);
 }
 return result;
};
const sources=walk('src',['.tsx','.ts','.js','.jsx']).filter(x=>!x.endsWith('.d.ts')).map(x=>readFileSync(x,'utf8'));
const css=walk('src',['.css']);
const used=name=>sources.some(src=>src.includes(name)); // conservative: underreports unused
const classes=selector=>Array.from(selector.matchAll(/\.([_a-zA-Z][_a-zA-Z0-9-]*)/g),x=>x[1]);
const rows=[],orphans=[];
for(const file of css){
 const content=readFileSync(file,'utf8'),root=postcss.parse(content,{from:file});
 const counts=new Map(),unique=new Set();
 let rules=0,unused=0;
 root.walkRules(rule=>{
  rules++;
  counts.set(rule.selector,(counts.get(rule.selector)||0)+1);
  const names=classes(rule.selector);
  names.forEach(x=>unique.add(x));
  if(names.length&&names.every(x=>!used(x))){
   unused++;
   if(file.endsWith('globals.css'))orphans.push({line:rule.source.start.line,selector:rule.selector});
  }
 });
 rows.push({file:relative('.',file),bytes:Buffer.byteLength(content),rules,classes:unique.size,orphanCandidates:unused,important:(content.match(/!important/g)||[]).length,duplicateSelectors:[...counts.values()].filter(x=>x>1).length});
}
console.table(rows);
console.log('Legacy globals.css unreferenced candidates:',JSON.stringify(orphans));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
 '## CSS inventory (conservative; manual review required)',
 '| CSS file | Bytes | Rules | Classes | Orphan candidates | !important | Duplicated selectors |',
 '|---|---:|---:|---:|---:|---:|---:|',
 ...rows.map(r=>`| ${r.file} | ${r.bytes} | ${r.rules} | ${r.classes} | ${r.orphanCandidates} | ${r.important} | ${r.duplicateSelectors} |`),
 '', 'Legacy candidates:',...orphans.map(x=>`- line ${x.line}: \`${x.selector}\``),
 '', 'Literal-source heuristic only; do not delete dynamic selectors blindly.'
].join('\n')+'\n');
