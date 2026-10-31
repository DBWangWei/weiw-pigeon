import test from 'node:test';
import assert from 'node:assert/strict';
import tiers from '../assets/pigeon-template/src/semantic-tiers.js';
const roles = [{uid:'q',role:'hook',hide:true},{uid:'a',role:'answer',hide:true},{uid:'t',role:'takeaway',hide:true}];
const c = (k, visible, extra={}) => ({k,name:`tier${k}`,tier:{show:visible},visible,emph:[],dim:[],pin:[],fx:null,background:null,...extra});
const deck = candidates => ({tiers:{mode:'slide',presets:{result:[{},{},{default:true}]}},slides:[{id:'p9',page:9,asset:'full.svg',semanticTiers:{preset:'result',roles,candidates}},{id:'p2',page:2,asset:'two.svg'}]});
test('independent visibility, adjacent deduplication, effects and default aliases',()=>{
 const m=deck([c(0,['q']),c(1,['q']),c(2,['a']),c(3,['q']),c(4,['q'],{pin:['q']})]);
 assert.deepEqual(tiers.states(m,0).map(x=>x.k),[0,2,3,4]);
 m.slides[0].semanticTiers.defaultTier=1; assert.equal(tiers.defaultIndex(m,0),0);
 m.slides[0].semanticTiers.defaultTier='tier3'; assert.equal(tiers.defaultIndex(m,0),2);
 assert.deepEqual(tiers.states(m,0)[1].visible,['a']);
});
test('pruning, skipped defaults, extraction and background-only states',()=>{
 const m=deck([c(0,['q']),c(1,[]),c(2,['a'],{fx:'extract'}),c(3,[],{background:'#000000'}),c(4,['t'],{fx:'extract'})]);
 assert.deepEqual(tiers.states(m,0).map(x=>x.k),[0,3,4]);
 m.slides[0].semanticTiers.defaultTier=2; assert.equal(tiers.defaultIndex(m,0),0);
 m.slides[0].semanticTiers.defaultTier=1; assert.equal(tiers.defaultIndex(m,0),0);
 m.slides[0].semanticTiers.roles=[]; assert.deepEqual(tiers.states(m,0).map(x=>x.k),[0,1,2,3,4].filter(k=>k!==2&&k!==4));
});
test('no roles is a single full fallback unless explicit background',()=>{
 const m=deck([c(0,['q']),c(1,['a'])]);m.slides[0].semanticTiers.roles=[];
 assert.equal(tiers.states(m,0).length,1);assert.equal(tiers.states(m,0)[0].asset,'full.svg');
 assert.equal(tiers.states(m,1).length,1);
});
test('all modes, shifted actions, clamping and immutable state',()=>{
 const m=deck([c(0,['q']),c(1,['a']),c(2,['t'])]);
 const s={mode:'step',page:0,tier:0,trail:[]};
 assert.equal(tiers.step(m,s,'next').tier,1);assert.equal(s.tier,0);
 let r=tiers.step(m,{...s,tier:2},'next');assert.equal(r.page,1);assert.equal(r.tier,0);
 r=tiers.step(m,r,'prev');assert.equal(r.page,0);assert.equal(r.tier,2);
 r=tiers.step(m,{...s,page:1},'shiftPrev');assert.equal(r.tier,0);
 r=tiers.step(m,{...s,mode:'slide'},'next');assert.equal(r.page,1);
 r=tiers.step(m,r,'prev');assert.equal(r.tier,2);
 assert.equal(tiers.step(m,{...s,mode:'slide'},'shiftNext').tier,1);
 assert.equal(tiers.step(m,s,'tierPrev').boundary,true);
 assert.equal(tiers.step(m,s,'prev').boundary,true);
 assert.equal(tiers.step(m,s,'toggleMode').mode,'slide');
 assert.equal(tiers.step(m,s,'end').page,1);
 assert.equal(tiers.step(m,{...s,page:1},'home').page,0);
});
test('nested deep navigation restores exact page tier and mode',()=>{
 const m=deck([c(0,['q']),c(1,['a'])]);
 m.slides[0].semanticTiers.deep=[{slideId:'p2'}];
 m.slides[1].semanticTiers={roles:[],candidates:[],deep:[{targetPage:9}]};
 const s={mode:'step',page:0,tier:1,trail:[]};
 const a=tiers.step(m,s,'deeper'), b=tiers.step(m,a,'deeper');
 assert.equal(b.page,0);assert.equal(b.trail.length,2);assert.equal(s.trail.length,0);
 assert.equal(tiers.step(m,b,'back').page,1);
 const restored=tiers.step(m,tiers.step(m,b,'back'),'back');
 assert.equal(restored.tier,1);assert.equal(restored.page,0);assert.equal(restored.mode,'step');
});
test('URL parts preserve session fields and use physical page identities',()=>{
 const m=deck([c(0,['q']),c(1,['a'])]);
 assert.deepEqual(tiers.parseURL('index.html?mode=step',m),{mode:'step'});
 assert.deepEqual(tiers.parseURL('index.html#9',m),{page:0});
 assert.deepEqual(tiers.parseURL('index.html?mode=slide#9.99',m),{mode:'slide',page:0,tier:1});
 assert.deepEqual(tiers.parseURL('index.html#2.1',m),{page:1,tier:0});
 assert.deepEqual(tiers.parseURL('index.html#bad',m),{});
 assert.equal(tiers.formatURL(m,{mode:'step',page:0,tier:1}),'?mode=step#9.2');
});
