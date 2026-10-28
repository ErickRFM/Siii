import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';

export const referenceSha256='756e6503bc292936fa507a5f3ad19d0abf2e313cfa053576820cd99f6104dcd3';
export const approvedGeometry={hero:[232,87,810,171],metrics:[232,272,810,83],details:[232,369,810,287],progress:[232,669,810,201],calendar:[1054,87,274,202],notices:[1054,302,274,207],sidebar:[16,14,198,860]};
export const thresholds={geometryPixels:2,pixelColorThreshold:.1,fullImageMismatchRatio:.1,materialChannelMeanDelta:20};
// Small text-free interiors, fixed against the supplied reference. No image pixels are masked.
const materialPatches={metric:[240,343,180,6],grades:[240,646,280,5],calendar:[1070,279,240,5],notices:[1070,495,240,5]};
function mean(image,[x,y,w,h]){const sums=[0,0,0];for(let row=y;row<y+h;row++)for(let column=x;column<x+w;column++)for(let channel=0;channel<3;channel++)sums[channel]+=image.data[(row*image.width+column)*4+channel];return sums.map(value=>value/(w*h));}
export function compareApprovedReference(candidatePath,geometry,outputDirectory){
 const bytes=readFileSync('docs/design/reference/siii-glass-approved.png');
 if(createHash('sha256').update(bytes).digest('hex')!==referenceSha256)throw new Error('Approved reference has changed; explicit reference review required');
 const reference=PNG.sync.read(bytes),candidate=PNG.sync.read(readFileSync(candidatePath));
 if(reference.width!==candidate.width||reference.height!==candidate.height)throw new Error(`Reference comparison requires exactly ${reference.width} × ${reference.height}; received ${candidate.width} × ${candidate.height}`);
 const diff=new PNG({width:reference.width,height:reference.height});
 const mismatch=pixelmatch(reference.data,candidate.data,diff.data,reference.width,reference.height,{threshold:thresholds.pixelColorThreshold,includeAA:false});
 const geometryErrors=Object.entries(approvedGeometry).flatMap(([name,expected])=>['x','y','width','height'].flatMap((field,index)=>Math.abs((geometry[name]?.[field]??Infinity)-expected[index])>thresholds.geometryPixels?[`${name}.${field}: ${geometry[name]?.[field]} vs ${expected[index]}`]:[]));
 const materials=Object.fromEntries(Object.entries(materialPatches).map(([name,rect])=>{const a=mean(reference,rect),b=mean(candidate,rect);return[name,{reference:a,candidate:b,maxChannelDelta:Math.max(...a.map((value,index)=>Math.abs(value-b[index])))}]}));
 const overlay=new PNG({width:reference.width,height:reference.height});for(let index=0;index<overlay.data.length;index++)overlay.data[index]=index%4===3?255:Math.round((reference.data[index]+candidate.data[index])/2);
 const mismatchRatio=mismatch/(reference.width*reference.height);
 const report={referenceSha256,candidateSha256:createHash('sha256').update(readFileSync(candidatePath)).digest('hex'),viewport:{width:reference.width,height:reference.height},thresholds,mismatchPixels:mismatch,mismatchRatio,fullImageWithinThreshold:mismatchRatio<=thresholds.fullImageMismatchRatio,geometryErrors,materials,compositionWithinThreshold:!geometryErrors.length&&Object.values(materials).every(value=>value.maxChannelDelta<=thresholds.materialChannelMeanDelta),masks:[],interpretation:'Raw mismatch is not a fidelity score. Data, wording, fonts and the temporarily omitted campus background remain visible in the unmasked diff. Composition passing does not certify 100% reproduction; inspect both images and the diff before release.'};
 mkdirSync(outputDirectory,{recursive:true});writeFileSync(`${outputDirectory}/reference-diff.png`,PNG.sync.write(diff));writeFileSync(`${outputDirectory}/reference-overlay.png`,PNG.sync.write(overlay));writeFileSync(`${outputDirectory}/reference-comparison.json`,JSON.stringify(report,null,2));
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=compareApprovedReference(process.argv[2],JSON.parse(readFileSync(process.argv[3],'utf8')),process.argv[4]??'.p0-local/fidelity');
 console.log(JSON.stringify(report,null,2));
 if(!report.compositionWithinThreshold||!report.fullImageWithinThreshold)process.exitCode=1;
}
