// Independent pixel check for native SVG masking of overlapping dim subregions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const {createCanvas,loadImage}=await import(process.env.PIGEON_CANVAS_DEPS
 ? pathToFileURL(resolve(process.env.PIGEON_CANVAS_DEPS,'@napi-rs/canvas/index.js')).href : '@napi-rs/canvas');
const domDeps=process.env.PIGEON_TEST_DEPS || process.env.PIGEON_CANVAS_DEPS;
const {Window}=await import(domDeps ? pathToFileURL(resolve(domDeps,'happy-dom/lib/index.js')).href : 'happy-dom');
const scripts=resolve(new URL('../scripts/',import.meta.url).pathname);

test('marking-only dim regions remove full-strength paint and overlap fades only once',async t=>{
 const temp=await mkdtemp(resolve(tmpdir(),'tier-dim-pixels-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const asset=resolve(temp,'source.svg');
 await writeFile(asset,'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#203040"/><rect x="20" y="20" width="160" height="60" fill="#ff0000"/></svg>');
 const regions=[{x:30,y:30,width:60,height:40},{x:70,y:30,width:60,height:40}];
 const result=spawnSync(process.env.PIGEON_PYTHON || 'python3',['-c',
  'import json,sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from tier_artwork import _mask_regions; print(_mask_regions(Path(sys.argv[2]),json.loads(sys.argv[3]),dict(width=200,height=100),Path(sys.argv[4])))',
  scripts,asset,JSON.stringify(regions),temp],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const backing=await loadImage(await readFile(result.stdout.trim())),full=await loadImage(await readFile(asset));
 const canvas=createCanvas(200,100),ctx=canvas.getContext('2d');ctx.drawImage(backing,0,0);
 const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
 assert.deepEqual(pixel(40,40),[32,48,64,255],'native backing removes the marking-only region toward page fill');
 assert.deepEqual(pixel(150,40),[255,0,0,255],'the rest of the figure stays intact');
 ctx.save();ctx.beginPath();regions.forEach(r=>ctx.rect(r.x,r.y,r.width,r.height));ctx.clip();ctx.globalAlpha=.25;ctx.drawImage(full,0,0);ctx.restore();
 const single=pixel(40,40),overlap=pixel(80,40);
 assert.deepEqual(overlap,single,'the union is composited only once');
 assert.ok(Math.abs(single[0]-88)<=1 && Math.abs(single[1]-36)<=1 && Math.abs(single[2]-48)<=1,`quarter-strength paint: ${single}`);

 // Exercise the production composition rather than asserting sibling styles.
 const w=new Window();t.after(()=>w.happyDOM.abort());
 w.HTMLImageElement.prototype.decode=async()=>{};
 w.eval(await readFile(new URL('../assets/pigeon-template/src/tier-renderer.js',import.meta.url),'utf8'));
 const frame=w.document.createElement('div'),image=w.document.createElement('img');frame.append(image);
 const url=bytes=>'data:image/svg+xml;base64,'+Buffer.from(bytes).toString('base64');
 const urls={full:url(await readFile(asset)),backing:url(await readFile(result.stdout.trim()))};
 const roles=regions.map((r,i)=>({...r,uid:'dim-'+i,role:'support'}));
 roles.push({x:20,y:20,width:160,height:60,uid:'message',role:'takeaway'});
 w.PigeonTierRenderer.render(frame,{width:200,height:100,semanticTiers:{roles}},
  {k:0,asset:'full',backingAsset:'backing',visible:roles.map(r=>r.uid),dim:['dim-0','dim-1'],fx:'extract'},
  {assetUrl:path=>urls[path],reducedMotion:true});
 assert.equal(Number(image.style.opacity),0,'only the grouped SVG contributes to the extracted base');
 const composition=frame.querySelector('.tier-dim-artwork');
 // The native canvas SVG reader omits <image> dependencies. Inline the same
 // native vector trees at their original size to test the production grouping,
 // clip union and opacity independently of that reader's image-loader limit.
 for(const source of composition.querySelectorAll('image')) {
  const text=Buffer.from(source.getAttribute('href').split(',')[1],'base64').toString().replace(/^<\?xml[^>]*\?>\s*/,'');
  const parsed=new w.DOMParser().parseFromString(text,'image/svg+xml');
  assert.equal(parsed.querySelector('parsererror'),null);
  const group=w.document.createElementNS('http://www.w3.org/2000/svg','g');
  for(const name of ['clip-path','opacity']) if(source.hasAttribute(name)) group.setAttribute(name,source.getAttribute(name));
  group.append(parsed.documentElement);source.replaceWith(group);
 }
 const serialized=new w.XMLSerializer().serializeToString(composition);
 const actual=createCanvas(200,100),actualCtx=actual.getContext('2d');actualCtx.fillStyle='white';actualCtx.fillRect(0,0,200,100);
 actualCtx.drawImage(await loadImage(Buffer.from(serialized)),0,0);
 const expected=createCanvas(200,100),expectedCtx=expected.getContext('2d');expectedCtx.fillStyle='white';expectedCtx.fillRect(0,0,200,100);
 expectedCtx.globalAlpha=.12;expectedCtx.drawImage(canvas,0,0);
 for(const [x,y] of [[40,40],[80,40],[150,40],[5,5]]) {
  const a=actualCtx.getImageData(x,y,1,1).data,e=expectedCtx.getImageData(x,y,1,1).data;
  assert.ok([...a].every((v,i)=>Math.abs(v-e[i])<=1),`extraction must fade the complete composition once at (${x},${y}): ${a} vs ${e}`);
 }
});
