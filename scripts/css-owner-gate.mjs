import fs from 'node:fs';
import postcss from 'postcss';
// Guard unconditional properties only; responsive, theme and forced-colors overrides remain independent.
const owners={
  ".sii-app .sii-catalog-scroll": [
    "max-width",
    "overflow-x",
    "overscroll-behavior-x",
    "scrollbar-width",
    "border-radius"
  ],
  ".sii-app .sii-catalog-pagination": [
    "flex-wrap",
    "gap"
  ],
  ".sii-app .sii-catalog-form label": [
    "line-height",
    "font-size"
  ],
  ".sii-app .sii-catalog-table": [
    "border-collapse",
    "border-spacing"
  ],
  ".sii-app .sii-page-heading": [
    "gap",
    "margin-bottom"
  ],
  ".sii-app .sii-page-heading h1": [
    "font-size",
    "line-height",
    "letter-spacing",
    "font-weight"
  ],
  ".sii-app .sii-page": [
    "max-width",
    "padding",
    "min-width"
  ],
  ".sii-app .sii-workspace-filters": [
    "display",
    "align-items",
    "gap"
  ],
  ".sii-app .sii-catalog-actions button": [
    "min-height"
  ],
  ".sii-app .sii-catalog-tab": [
    "line-height",
    "transition"
  ],
  ".sii-app .sii-catalog-table th": [
    "font-size",
    "color"
  ],
  ".sii-app .sii-catalog-table td": [
    "line-height"
  ],
  ".sii-app .sii-catalog-tab--active": [
    "box-shadow"
  ],
  ".sii-app .sii-catalog-table tbody tr:hover": [
    "background"
  ],
  ".sii-app .sii-catalog-table tbody tr": [
    "transition"
  ],
  ".sii-app .sii-panel-top": [
    "gap"
  ],
  ".sii-app .sii-empty": [
    "padding"
  ]
};

const layout=fs.readFileSync('src/app/layout.tsx','utf8');
const imported=[...layout.matchAll(/import '\.\/([^']+\.css)'/g)].map(match=>'src/app/'+match[1]);
if(imported.length<10)throw Error('CSS imports unexpectedly missing from root layout');
const found=new Map();
for(const file of imported){
 const root=postcss.parse(fs.readFileSync(file,'utf8'),{from:file});
 root.walkRules(rule=>{
  if(rule.parent!==root||!Object.hasOwn(owners,rule.selector))return;
  rule.walkDecls(decl=>{
   if(!owners[rule.selector].includes(decl.prop))return;
   const key=rule.selector+' :: '+decl.prop;
   const locations=found.get(key)||[];
   locations.push(file);
   found.set(key,locations);
  });
 });
}
const errors=[];
for(const [selector,properties] of Object.entries(owners)){
 for(const property of properties){
  const key=selector+' :: '+property;
  const sources=found.get(key)||[];
  if(sources.length!==1)errors.push({property:key,definitions:sources});
 }
}
console.log('CSS_PROPERTY_OWNER_GATE',JSON.stringify({
 selectors:Object.keys(owners).length,
 properties:Object.values(owners).reduce((n,properties)=>n+properties.length,0),
 errors
}));
if(errors.length)process.exitCode=1;
