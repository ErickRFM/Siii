import fs from 'node:fs';
import path from 'node:path';

const cssFiles = [
  'src/app/academic-v2.css',
  'src/app/globals.css',
  'src/app/sii-glass.css',
  'src/app/sii-interactions.css',
  'src/app/sii-kit-components.css',
  'src/app/sii-motion-polish.css',
  'src/app/sii-premium-kit.css',
  'src/app/sii-system-coherence.css',
  'src/app/sii-tailwind.css',
  'src/app/sii-ux-refinement.css',
  'src/app/sii-v2.css',
  'src/app/sii-workspaces.css',
  'src/components/institution-admin.css',
  'src/components/institution-users.css'
];

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

const report = [];
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
    bytes: Buffer.byteLength(raw,'utf8'),
    rules: rules.length,
    classes: classes.size,
    orphanCandidates: 0,
    important,
    duplicateSelectors
  });
}

console.table(report);
const totalBytes = report.reduce((a,b)=>a+b.bytes,0);
const totalImportant = report.reduce((a,b)=>a+b.important,0);
const totalDup = report.reduce((a,b)=>a+b.duplicateSelectors,0);
const baselinePath = path.resolve('scripts/css-audit-baseline.json');
const current = {generatedAt:new Date().toISOString(), totalBytes, totalImportant, totalDup, files: report};
fs.writeFileSync(baselinePath, JSON.stringify(current,null,2));
console.log('Wrote baseline:', baselinePath);
console.log({totalBytes, totalImportant, totalDup});
