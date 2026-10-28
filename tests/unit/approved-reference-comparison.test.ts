import {describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {approvedGeometry,compareApprovedReference,referenceSha256} from '../../scripts/compare-approved-reference.mjs';

const reference=readFileSync('docs/design/reference/siii-glass-approved.png');
function fixture(){mkdirSync('.p0-local/fidelity',{recursive:true});const directory=mkdtempSync(resolve('.p0-local/fidelity/compare-unit-'));const path=directory+'/candidate.png';writeFileSync(path,reference);const geometry=Object.fromEntries(Object.entries(approvedGeometry).map(([name,values])=>[name,Object.fromEntries(['x','y','width','height'].map((field,index)=>[field,values[index]]))]));return {directory,path,geometry};}
describe('immutable approved image and useful visual diagnostics',()=>{
 it('matches the user-supplied reference identity and reports an identical image without masks',()=>{
  expect(createHash('sha256').update(reference).digest('hex')).toBe(referenceSha256);
  const f=fixture(),result=compareApprovedReference(f.path,f.geometry,f.directory);
  expect(result.mismatchRatio).toBe(0);expect(result.fullImageWithinThreshold).toBe(true);expect(result.compositionWithinThreshold).toBe(true);expect(result.masks).toEqual([]);
 });
 it('rejects displaced composition and materially different pixels rather than accepting its own new screenshot',()=>{
  const f=fixture(),image=PNG.sync.read(reference);for(let index=0;index<image.data.length;index+=4){image.data[index]=255;image.data[index+1]=0;image.data[index+2]=0;image.data[index+3]=255}writeFileSync(f.path,PNG.sync.write(image));f.geometry.hero.x+=24;
  const result=compareApprovedReference(f.path,f.geometry,f.directory);expect(result.mismatchRatio).toBeGreaterThan(.9);expect(result.fullImageWithinThreshold).toBe(false);expect(result.compositionWithinThreshold).toBe(false);expect(result.geometryErrors).toContain('hero.x: 256 vs 232');
 });
 it('refuses a different viewport rather than stretching it to hide geometry changes',()=>{
  const f=fixture();writeFileSync(f.path,PNG.sync.write(new PNG({width:390,height:896})));expect(()=>compareApprovedReference(f.path,f.geometry,f.directory)).toThrow('requires exactly 1344');
 });
});
