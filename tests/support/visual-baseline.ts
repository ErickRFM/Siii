import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {expect,type TestInfo} from '@playwright/test';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';

/**
 * Unmasked comparison against reviewed synthetic screenshots, with a 5% pixel budget.
 * Browser text metrics can extend the very bottom of a full-page mobile PNG by 1-2 px.
 * Charge every unmatched trailing pixel to the diff budget; never crop or mask UI content
 * without accounting for it, and keep the reference dimensions as the visual oracle.
 */
export function expectVisualBaseline(actualBytes:Buffer,name:string,info:TestInfo){
 const actual=PNG.sync.read(actualBytes);
 const platformPath=`tests/ui/visual-baselines/${name}-${process.platform}.png`;
 const reference=PNG.sync.read(readFileSync(existsSync(platformPath)?platformPath:`tests/ui/visual-baselines/${name}.png`));
 expect(actual.width,`${name}: visual width`).toBe(reference.width);
 const delta=Math.abs(actual.height-reference.height);
 expect(delta,`${name}: full-page height drift (maximum 2px)`).toBeLessThanOrEqual(2);
 const comparedHeight=Math.min(actual.height,reference.height);
 const overlapBytes=actual.width*comparedHeight*4;
 const diff=new PNG({width:actual.width,height:Math.max(actual.height,reference.height)});
 const compared=pixelmatch(
  reference.data.subarray(0,overlapBytes),
  actual.data.subarray(0,overlapBytes),
  diff.data.subarray(0,overlapBytes),
  actual.width,comparedHeight,
  {threshold:.1,includeAA:false}
 );
 // Missing or extra trailing rows count as differing pixels, not as ignored space.
 const unmatched=delta*actual.width;
 for(let offset=overlapBytes;offset<diff.data.length;offset+=4){
  diff.data[offset]=255;diff.data[offset+1]=0;diff.data[offset+2]=0;diff.data[offset+3]=255;
 }
 const changed=compared+unmatched;
 const ratio=changed/(actual.width*Math.max(actual.height,reference.height));
 writeFileSync(info.outputPath(`${name}-diff.png`),PNG.sync.write(diff));
 expect(ratio,`${name}: unmasked differing pixels (including any trailing rows)`).toBeLessThanOrEqual(.05);
}
