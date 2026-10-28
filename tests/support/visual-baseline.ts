import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {expect,type TestInfo} from '@playwright/test';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';

/** Unmasked comparison against reviewed synthetic screenshots, with a 5% pixel budget. */
export function expectVisualBaseline(actualBytes:Buffer,name:string,info:TestInfo){
 const actual=PNG.sync.read(actualBytes);
 const platformPath=`tests/ui/visual-baselines/${name}-${process.platform}.png`;
 const reference=PNG.sync.read(readFileSync(existsSync(platformPath)?platformPath:`tests/ui/visual-baselines/${name}.png`));
 expect({width:actual.width,height:actual.height},`${name} dimensions`).toEqual({width:reference.width,height:reference.height});
 const diff=new PNG({width:actual.width,height:actual.height});
 const changed=pixelmatch(reference.data,actual.data,diff.data,actual.width,actual.height,{threshold:.1,includeAA:false});
 const ratio=changed/(actual.width*actual.height);
 writeFileSync(info.outputPath(`${name}-diff.png`),PNG.sync.write(diff));
 expect(ratio,`${name}: unmasked differing pixels`).toBeLessThanOrEqual(.05);
}
