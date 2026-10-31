import {readFile, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {createHash} from 'node:crypto';
export async function buildFileBundle(root) {
  const pathFor = path => path.startsWith('public/') ? path : `public/deck/${path}`;
  const manifest = JSON.parse(await readFile(resolve(root,'public/deck/manifest.json'),'utf8'));
  const graph = JSON.parse(await readFile(resolve(root,'public/deck/knowledge-graph.json'),'utf8'));
  if (manifest.revision !== graph.revision || manifest.deckId !== graph.deckId) throw new Error('Deck/graph identity mismatch');
  const assets = {}, titleSvgs = {}, resources = {};
  async function add(path) {
    path = pathFor(path);
    const resolved = resolve(root,path);
    if (!resolved.startsWith(resolve(root,'public/deck') + '/')) throw new Error(`Asset escapes deck directory: ${path}`);
    const bytes = await readFile(resolved);
    const type = {'.svg':'image/svg+xml','.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.html':'text/html','.htm':'text/html','.txt':'text/plain'}[extname(path)] || 'application/octet-stream';
    assets[path] = `data:${type};base64,${bytes.toString('base64')}`;
    return bytes;
  }
  for (const slide of manifest.slides) {
    const bytes = await add(slide.asset);
    if (createHash('sha256').update(bytes).digest('hex') !== slide.assetHash) throw new Error(`Stale SVG: ${slide.asset}`);
    if (slide.titleLayer) {
      await add(slide.titleLayer.baseAsset);
      titleSvgs[pathFor(slide.titleLayer.asset)] = (await add(slide.titleLayer.asset)).toString('utf8');
    }
  }
  for (const slide of manifest.slides) for (const candidate of slide.semanticTiers?.candidates || []) {
    for (const [asset, hash] of [[candidate.asset,candidate.assetHash],[candidate.backingAsset,candidate.backingAssetHash || candidate.backingHash]]) {
      if (!asset) continue;
      const bytes = await add(asset);
      if (!hash || createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Stale tier SVG: ${asset}`);
    }
    if (candidate.titleLayer) {
      const layer = candidate.titleLayer;
      for (const [asset, hash] of [[layer.asset,layer.assetHash],[layer.baseAsset,layer.baseAssetHash]]) {
        const bytes = await add(asset);
        if (hash && createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Stale tier title: ${asset}`);
        if (asset === layer.asset) titleSvgs[pathFor(asset)] = bytes.toString('utf8');
      }
    }
  }
  await add(manifest.pdf);
  for (const path of manifest.resources || []) {
    const bytes = await add(path);
    if (/\.html?$/i.test(path)) resources[pathFor(path)] = bytes.toString('utf8');
  }
  const bundle = {revision:manifest.revision,json:{'public/deck/manifest.json':manifest,'public/deck/knowledge-graph.json':graph},assets,titleSvgs,resources};
  const payload = JSON.stringify(bundle).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  await writeFile(resolve(root,'public/deck/embedded-deck.js'),`window.PIGEON_DECK_BUNDLE=${payload};\n`);
  console.log(`Bundled ${manifest.slides.length} slides, titles, graph, PDF and linked resources`);
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await buildFileBundle(resolve(process.argv[2] || '.'));
