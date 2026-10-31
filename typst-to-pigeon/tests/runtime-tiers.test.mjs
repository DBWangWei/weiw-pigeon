import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,press} from './runtime-harness.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));

test('slide and step navigation use independent authored states and defaults',async t=>{
 const {a,w,d}=await setup(t);
 assert.equal(a.state.currentId,'01');assert.equal(a.state.tierMode,'slide');assert.equal(a.state.tier,1);
 assert.ok(d.querySelector('#tierHud')); assert.match(w.location.hash,/#1\.2/);
 const answer=a.presentationSlide().asset;
 press(w,d,',');assert.equal(a.state.tier,0);assert.notEqual(a.presentationSlide().asset,answer);
 press(w,d,'PageDown',{shiftKey:true});assert.equal(a.state.tier,1);assert.equal(a.state.currentId,'01');
 press(w,d,'n');assert.equal(a.state.tierMode,'step');assert.equal(a.state.tier,1);
 a.nextSlide();assert.equal(a.state.currentId,'01');assert.equal(a.state.tier,2);
 a.nextSlide();assert.equal(a.state.currentId,'02');assert.equal(a.state.tier,0);
 a.nextSlide(-1);assert.equal(a.state.currentId,'01');assert.equal(a.state.tier,2);
 press(w,d,'PageDown',{shiftKey:true});assert.equal(a.state.currentId,'02');assert.equal(a.state.tier,0);
});

test('hidden targets cannot dispatch voice or Wand and crop assets follow current tier',async t=>{
 const {a,w,d}=await setup(t);
 a.navigateTo('02');a.setTier(0);
 assert.equal(a.presentationSlide().semanticRegions.length,0);
 assert.equal(a.voice.dispatch('table'),'none');
 a.setTier(1);assert.ok(a.presentationSlide().semanticRegions.some(r=>r.target==='_table'));
 a.voice.dispatch('table');assert.ok(d.querySelector('.pigeon-voice-overlay'));
 const src=d.querySelector('.pigeon-voice-overlay img').src;
 assert.equal(src,w.PIGEON_DECK_BUNDLE.assets['public/deck/'+a.presentationSlide().asset]);
 a.setTier(0);assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
 const hidden=a.state.deck.slides.find(s=>s.id==='02').semanticTiers.roles.find(r=>r.role==='answer');
 assert.equal(a.presentationSlide().wandRegions.some(r=>r.x<hidden.x+hidden.width&&r.x+r.width>hidden.x&&r.y<hidden.y+hidden.height&&r.y+r.height>hidden.y),false);
});

test('dimming extraction backgrounds and title backings use candidate artwork',async t=>{
 const {a,d}=await setup(t);
 a.navigateTo('02');a.setTier(2);
 assert.ok(d.querySelector('.slide-frame.current .tier-dim-artwork image'));
 assert.equal(a.presentationSlide().titleLayer,null,'dim states keep original static title without full backing leak');
 a.navigateTo('04');a.setTier(0);
 assert.equal(d.querySelectorAll('.slide-frame.current .tier-extract-crop').length,2);
 assert.equal(Number(d.querySelector('.slide-frame.current > img').style.opacity),.12);
 a.navigateTo('05');a.setTier(3);
 const c=a.tierCandidate();assert.equal(c.background,'#E5F1FA');assert.equal(c.visible.length,0);
 assert.match(d.querySelector('.slide-frame.current > img').src,/data:image\/svg/);
});

test('deep back history and session restoration retain exact tier and do not alter ink',async t=>{
 const {a,d,w}=await setup(t);
 a.navigateTo('04');a.setTier(0);const camera=plain(a.state.camera);
 const ink=plain(a.sessionPayload().annotations);
 press(w,d,'Enter');assert.equal(a.state.currentId,'06');assert.equal(a.state.tierTrail.length,1);
 press(w,d,'r');assert.equal(a.state.currentId,'04');assert.equal(a.state.tier,0);assert.deepEqual(plain(a.state.camera),camera);
 assert.deepEqual(Object.entries(plain(a.sessionPayload().annotations)).filter(([,ops])=>ops.length),Object.entries(ink).filter(([,ops])=>ops.length));
 const saved=a.sessionPayload();a.navigateTo('05');a.applySession(saved);a.syncTierView();
 assert.equal(a.state.currentId,'04');assert.equal(a.state.tier,0);
 const old=plain(saved);delete old.tier;delete old.tierMode;delete old.tierTrail;
 old.history.forEach(v=>{delete v.tier;delete v.tierMode;delete v.tierTrail;});
 assert.doesNotThrow(()=>a.validateSession(old));
 const bad=plain(saved);bad.tierTrail=[{id:'bogus'}];assert.throws(()=>a.validateSession(bad),/tier return/);
});

test('URL startup and input ownership preserve drawing controls',async t=>{
 const {a,d,w}=await setup(t,{url:'file:///pigeon/index.html?mode=step#5.3'});
 assert.equal(a.state.currentId,'05');assert.equal(a.state.tier,2);assert.equal(a.state.tierMode,'step');
 const input=d.querySelector('#boardNameInput');input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'.',bubbles:true}));assert.equal(a.state.tier,2);
 press(w,d,'PageUp',{altKey:true});assert.equal(a.state.currentId,'05');
 press(w,d,'m');assert.equal(a.state.tool,'wand');press(w,d,'M',{shiftKey:true});assert.equal(a.state.tool,'wand');
 a.setTool('navigate');a.toggleWhiteboard();assert.equal(a.state.whiteboard,true);assert.equal(d.querySelector('#tierHud').hidden,true);
 a.nextSlide(-1);assert.equal(a.state.whiteboard,false);assert.equal(a.state.currentId,'05');
 assert.ok(a.state.tier>=0);
});

test('board exits resolve destination defaults and restore explicit nonzero tiers',async t=>{
 const {a,w}=await setup(t);
 const index=a.state.deck.slides.findIndex(s=>s.id==='02');
 const expected=w.PigeonTiers.defaultIndex(a.state.deck,index);assert.ok(expected>0);
 a.navigateTo('02');a.toggleWhiteboard();a.nextSlide(-1);
 assert.equal(a.state.whiteboard,false);assert.equal(a.state.currentId,'02');assert.equal(a.state.tier,expected);
 a.navigateTo('01');a.toggleWhiteboard();a.nextSlide();
 assert.equal(a.state.currentId,'02');assert.equal(a.state.tier,expected);
 a.toggleWhiteboard();a.navigateTo('02',{force:true,tier:2});
 assert.equal(a.state.whiteboard,false);assert.equal(a.state.tier,2);
});

test('failed tier artwork stays neutral, retains its image and recovers on load',async t=>{
 const {a,d,w}=await setup(t);a.setTier(0);
 const frame=d.querySelector('.slide-frame.current'),image=frame.querySelector(':scope > img');
 a.state.deck.slides[0].summary='SECRET ANSWER FROM THE COMPLETE SOURCE';
 image.dispatchEvent(new w.Event('error'));
 assert.equal(frame.querySelector(':scope > img'),image);
 assert.match(frame.querySelector('.slide-fallback').textContent,/Tier artwork unavailable/);
 assert.doesNotMatch(frame.querySelector('.slide-fallback').textContent,/SECRET/);
 assert.equal(frame.dataset.artworkError,'true');
 a.setTier(1);image.dispatchEvent(new w.Event('load'));
 assert.equal(frame.querySelector('.slide-fallback'),null);assert.equal(frame.dataset.artworkError,undefined);
 assert.equal(image.style.visibility,'');
});

test('title cleanup preserves dim backings and extraction dims the full base composition',async t=>{
 const {a,d,w}=await setup(t);a.navigateTo('02');a.setTier(1);
 a.state.titleEffect='split-text';await a.syncTitleEffect(true);
 assert.ok(d.querySelector('.slide-frame.current .title-artwork'));
 a.applyTierURL('file:///pigeon/index.html#2.3');await Promise.resolve();
 assert.equal(d.querySelector('.slide-frame.current > img').src,w.PIGEON_DECK_BUNDLE.assets['public/deck/'+a.tierCandidate().backingAsset]);
 a.navigateTo('04');a.setTier(0);await a.syncTitleEffect(true);
 assert.equal(d.querySelector('.slide-frame.current .title-artwork'),null);
 const candidate=a.tierCandidate();candidate.dim=[candidate.visible[0]];candidate.backingAsset=candidate.asset;
 w.PigeonTierRenderer.render(d.querySelector('.slide-frame.current'),a.state.deck.slides.find(s=>s.id==='04'),candidate,{assetUrl:path=>w.PIGEON_DECK_BUNDLE.assets['public/deck/'+path]});
 assert.equal(Number(d.querySelector('.slide-frame.current > img').style.opacity),0);
 assert.equal(d.querySelector('.slide-frame.current .tier-dim-artwork g').getAttribute('opacity'),'.12');
 assert.equal(d.querySelector('.slide-frame.current .tier-dim-artwork image[clip-path]').getAttribute('opacity'),'.25');
 assert.equal(d.querySelectorAll('.slide-frame.current .tier-extract-crop').length,2);
});

test('deep destinations follow visible author IDs and share the HUD selection order',async t=>{
 const {a,d,w}=await setup(t),slide=a.state.deck.slides[0];
 slide.semanticTiers.roles.find(r=>r.role==='hook').id='question';
 slide.semanticTiers.roles.find(r=>r.role==='answer').id='answer';
 slide.semanticTiers.deep=[{slideId:'05',to:'question'},{slideId:'06',to:'answer'}];
 a.setTier(0);assert.equal(d.querySelectorAll('.tier-deep-select option').length,1);
 press(w,d,'Enter');assert.equal(a.state.currentId,'05');press(w,d,'r');assert.equal(a.state.tier,0);
 a.setTier(1);assert.equal(d.querySelectorAll('.tier-deep-select option').length,1);
 press(w,d,'Enter');assert.equal(a.state.currentId,'06');press(w,d,'r');assert.equal(a.state.tier,1);
});

test('explicit startup URLs override a restored session and outgoing snapshots use current tier composition',async t=>{
 const initial=await setup(t);initial.a.navigateTo('02');initial.a.setTier(2);
 const saved=plain(initial.a.sessionPayload());
 const {a,d,w}=await setup(t,{url:'file:///pigeon/index.html?mode=step#5.2',session:saved});
 assert.equal(a.state.currentId,'05');assert.equal(a.state.tier,1);assert.equal(a.state.tierMode,'step');
 a.navigateTo('04');a.setTier(0);
 const frame=d.querySelector('.slide-frame.current');
 const snapshot=w.PigeonTransitions.capture({stage:d.querySelector('#stage'),frame,asset:a.presentationSlide().asset});
 assert.equal(snapshot.page.querySelector('img').src,frame.querySelector(':scope > img').src);
 assert.equal(Number(snapshot.page.querySelector('img').style.opacity),.12);
 assert.equal(snapshot.page.querySelectorAll('.tier-extract-crop').length,2);
 const before=a.state.tool;a.setTool('pen');a.state.reducedMotion=true;
 a.setTier(1);assert.equal(a.state.tool,'pen');a.setTool(before);
});

test('PNG document export uses complete source artwork while a question tier is active',async t=>{
 const {a,w}=await setup(t);a.setTier(0);
 const requested=[];
 w.Image=class {set src(value){requested.push(value);} async decode(){}};
 let encoded=false;w.HTMLCanvasElement.prototype.toBlob=function(){encoded=true;};
 await a.exportPng();
 assert.ok(encoded);
 const full=a.state.deck.slides[0].asset;
 assert.notEqual(full,a.presentationSlide().asset);
 assert.deepEqual(requested,[w.PIGEON_DECK_BUNDLE.assets['public/deck/'+full]]);
 assert.equal(a.state.tier,0);
});
