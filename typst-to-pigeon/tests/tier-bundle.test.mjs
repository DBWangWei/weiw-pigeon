import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildFileBundle} from '../scripts/build-file-bundle.mjs';

test('portable bundle includes every tier dependency and rejects stale title or missing backing',async t=>{
 const temp=await mkdtemp(resolve(tmpdir(),'tier-bundle-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 await cp(resolve(process.env.PIGEON_FIXTURE_ROOT),temp,{recursive:true});
 const manifest=JSON.parse(await readFile(resolve(temp,'public/deck/manifest.json'),'utf8'));
 await buildFileBundle(temp);
 const embed=await readFile(resolve(temp,'public/deck/embedded-deck.js'),'utf8');
 const bundle=JSON.parse(embed.slice('window.PIGEON_DECK_BUNDLE='.length).trim().replace(/;$/,''));
 for(const slide of manifest.slides) for(const c of slide.semanticTiers?.candidates || [])
  for(const path of [c.asset,c.backingAsset,c.titleLayer?.asset,c.titleLayer?.baseAsset].filter(Boolean))
   assert.ok(bundle.assets['public/deck/'+path],path);
 const candidate=manifest.slides.flatMap(s=>(s.semanticTiers?.candidates || []).filter(c=>c.asset!==s.asset && c.titleLayer))[0];
 assert.ok(candidate?.titleLayer?.assetHash);
 const title=resolve(temp,'public/deck',candidate.titleLayer.asset),original=await readFile(title);
 await writeFile(title,Buffer.concat([original,Buffer.from('\n<!-- stale -->')]));
 await assert.rejects(buildFileBundle(temp),/Stale tier title/);
 await writeFile(title,original);
 const backing=manifest.slides.flatMap(s=>s.semanticTiers?.candidates || []).find(c=>c.backingAsset)?.backingAsset;
 assert.ok(backing);await rm(resolve(temp,'public/deck',backing));
 await assert.rejects(buildFileBundle(temp),/ENOENT/);
});
