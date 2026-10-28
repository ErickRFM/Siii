import fs from 'node:fs';
import path from 'node:path';

function stylesheets(directory){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  return entry.isDirectory()?stylesheets(file):entry.isFile()&&file.endsWith('.css')?[file.replaceAll('\\','/')]:[];
 });
}
const cssFiles=stylesheets('src').sort();

function stripComments(s){ return s.replace(/\/\*[\s\S]*?\*\//g,''); }
function getRules(css){
  const out=[];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while((m=re.exec(css))){
    const sel = m[1].trim();
    if(!sel) continue;
    const body = m[2];
    out.push({sel, body});
  }
  return out;
}

export const report = [];
for (const f of cssFiles){
  const full = path.resolve(f);
  if(!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full,'utf8');
  const css = stripComments(raw);
  const rules = getRules(css);
  const classes = new Set();
  for (const r of rules){
    const sels = r.sel.split(',').map(x=>x.trim()).filter(Boolean);
    for (const s of sels){
      const cls = s.match(/\.([a-zA-Z0-9_-]+)/g);
      if(cls) for (const c of cls) classes.add(c.slice(1));
    }
  }
  let important = 0;
  if(css.match(/!important/g)) important = (css.match(/!important/g)||[]).length;
  const selectorCounts = {};
  for (const r of rules){
    const sels = r.sel.split(',').map(x=>x.trim()).filter(Boolean);
    for (const s of sels){
      selectorCounts[s] = (selectorCounts[s]||0)+1;
    }
  }
  const duplicateSelectors = Object.values(selectorCounts).filter(v=>v>1).length;
  report.push({
    file: f,
    bytes: Buffer.byteLength(raw.replaceAll('\r\n','\n'),'utf8'),
    rules: rules.length,
    classes: classes.size,
    orphanCandidates: 0,
    important,
    duplicateSelectors
  });
}

console.table(report);
export const totalBytes = report.reduce((a,b)=>a+b.bytes,0);
export const totalImportant = report.reduce((a,b)=>a+b.important,0);
export const totalDup = report.reduce((a,b)=>a+b.duplicateSelectors,0);
const baselinePath=path.resolve('scripts/css-audit-baseline.json');
if(!fs.existsSync(baselinePath)){
 console.error('CSS budget baseline missing: '+baselinePath);
 process.exitCode=1;
}else{
 const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
 const actual={totalBytes,totalImportant,totalDup};
 const errors=[];
 const limits={totalBytes:baseline.totalBytes,totalImportant:baseline.totalImportant,totalDup:baseline.totalDup};
 const previous=new Map((baseline.files||[]).map(item=>[item.file,item]));
 for(const row of report){
  const allowed=previous.get(row.file);
  if(!allowed){errors.push('CSS file has no reviewed budget: '+row.file);continue;}
  for(const field of ['bytes','important','duplicateSelectors']){
   if(row[field]>allowed[field])errors.push(row.file+': '+field+' increased '+allowed[field]+' → '+row[field]);
  }
 }
 for(const file of previous.keys())if(!report.some(row=>row.file===file))console.log('Previously tracked stylesheet removed:',file);
 for(const metric of ['totalBytes','totalImportant','totalDup']){
  if(actual[metric]>limits[metric])errors.push(metric+': '+actual[metric]+' exceeds baseline '+limits[metric]);
 }
 const details={actual,limits,errors};
 console.log('CSS regression gate:',JSON.stringify(details,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  '\\n## CSS regression gate\\n'+Object.keys(actual).map(metric=>'- '+metric+': '+actual[metric]+' / '+limits[metric]).join('\\n')+
  (errors.length?'\\nFAILED: '+errors.join('; '):'\\nPASS: no increases against versioned baseline')+'\\n');
 if(errors.length)process.exitCode=1;
}
