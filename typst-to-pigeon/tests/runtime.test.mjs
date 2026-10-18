import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {Window} = await import(process.env.PIGEON_TEST_DEPS ? pathToFileURL(resolve(process.env.PIGEON_TEST_DEPS,'happy-dom/lib/index.js')).href : 'happy-dom');
const root=resolve(process.env.PIGEON_FIXTURE_ROOT);
const markup=await readFile(resolve(root,'index.html'),'utf8');
const app=await readFile(resolve(root,'src/app.js'),'utf8');
const effects=await readFile(resolve(root,'src/title-effects.js'),'utf8');
const transitions=await readFile(resolve(root,'src/slide-transitions.js'),'utf8');
const embedded=await readFile(resolve(root,'public/deck/embedded-deck.js'),'utf8');
async function setup(t) {
  const w=new Window({url:'file:///pigeon/index.html',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  t.after(()=>w.happyDOM.abort());
  const calls=[];
  w.Element.prototype.animate=function(frames,options){const record={element:this,frames,options,cancelled:false};calls.push(record);return {cancel(){record.cancelled=true;}};};
  w.HTMLImageElement.prototype.decode=async()=>{};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({}, {get:(t,k)=>t[k] || (()=>{}),set:(t,k,v)=>(t[k]=v,true)});
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,x:0,y:0,width:1440,height:1000,right:1440,bottom:1000};};
  w.Element.prototype.setPointerCapture=()=>{};w.Element.prototype.releasePointerCapture=()=>{};
  w.structuredClone=structuredClone;
  w.fetch=()=>{throw new Error('Unexpected fetch in file mode');};
  w.document.write(markup.replace(/<script[\s\S]*?<\/script>/g,''));
  w.eval(effects);w.eval(transitions);w.eval(embedded);
  w.eval(app+'\nwindow.testApp={state,normaliseManifest,navigateTo,nextSlide,fitCurrent,fitWhole,canvasPoint,sessionPayload,validateSession,toggleWhiteboard,keyHandler,setTool,openOverview,closeOverview,syncTitleEffect,stopTitleEffect,viewSequence,showWand,pageTransitions,cancelPageTransition,zoomAt,historyMove,resumeRoute,reconcilePresentation};');
  await new Promise(r=>setTimeout(r,40));
  return {w,a:w.testApp,d:w.document,calls};
}

test('file opening uses matching assets and variable frame/canvas geometry',async t=>{
  const {a,d}=await setup(t);
  assert.match(d.querySelector('#readyState').textContent,/Ready offline/);
  assert.equal(a.state.deck.slides.length,3);
  assert.ok(d.querySelector('#pdfLink').href.endsWith('/public/deck/geometry.pdf'));
  for(const slide of a.state.deck.slides){
    const frame=d.querySelector(`[data-frame-key="slide:${slide.id}"]`);
    assert.equal(frame.style.width,`${slide.width}px`);
    assert.equal(frame.querySelector('canvas').height,Math.ceil(slide.height));
  }
});
test('portrait annotation/session bounds follow the page, and boards preserve geometry',async t=>{
  const {a,d}=await setup(t);a.navigateTo('portrait');
  const canvas=d.querySelector('.slide-frame.current canvas');
  const point=a.canvasPoint({clientX:720,clientY:900},canvas);
  assert.equal(point.x,250);assert.equal(point.y,765);
  a.state.annotations.portrait=[{type:'stroke',color:'#DC2626',width:4,points:[point]}];
  assert.equal(a.validateSession(a.sessionPayload()).annotations.portrait[0].points[0].y,765);
  a.toggleWhiteboard();assert.equal(a.state.whiteboard,true);
  assert.equal(d.querySelector('.slide-frame.current canvas').height,850);
  a.toggleWhiteboard();assert.equal(a.state.whiteboard,false);
});
test('all five effects animate only isolated title glyphs, then None restores the original',async t=>{
  const {a,d,w,calls}=await setup(t);
  for(const name of ['split-text','blur-text','shiny-text','gradient-text','text-type']){
    const start=calls.length;const select=d.querySelector('#titleEffectSelect');
    select.value=name;select.dispatchEvent(new w.Event('change'));
    await new Promise(r=>setTimeout(r,10));
    assert.equal(a.state.titleEffect,name);
    assert.ok(calls.length>start,`${name} creates animation`);
    assert.equal(d.querySelectorAll('.title-artwork').length,1);
    assert.ok(d.querySelector('.title-artwork .pigeon-title-glyph'));
    assert.equal(d.querySelector('.slide-frame.current').dataset.titleActive,'true');
  }
  a.state.titleEffect='none';await a.syncTitleEffect(true);
  assert.equal(d.querySelectorAll('.title-artwork').length,0);
  assert.ok(calls.every(call=>call.cancelled));
  assert.equal(d.querySelector('.slide-frame.current img').src,w.PIGEON_DECK_BUNDLE.assets['public/deck/slides/page-1.svg']);
});
test('rapid navigation and reduced motion leave no stale title animation',async t=>{
  const {a,d,calls}=await setup(t);
  a.state.titleEffect='split-text';const pending=a.syncTitleEffect(true);
  a.navigateTo('portrait');a.navigateTo('03');await pending;
  await new Promise(r=>setTimeout(r,20));
  assert.equal(d.querySelectorAll('.title-artwork').length,1);
  assert.ok(d.querySelector('.slide-frame.current .title-artwork'));
  a.state.reducedMotion=true;await a.syncTitleEffect(true);
  assert.equal(d.querySelectorAll('.title-artwork').length,0);
  assert.ok(calls.every(call=>call.cancelled));
});
test('title selector keeps arrow keys for its own choices; pen remains selected during slide advances',async t=>{
  const {a,d,w}=await setup(t);
  d.querySelector('#titleEffectSelect').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(a.state.currentId,'intro');
  a.setTool('pen');d.querySelector('#stage').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(a.state.currentId,'portrait');assert.equal(a.state.tool,'pen');
  d.querySelector('#stage').dispatchEvent(new w.KeyboardEvent('keydown',{key:'p',bubbles:true}));
  assert.equal(a.state.tool,'navigate');
});

test('old manifests and the initial selector retain the original camera transition',async t=>{
  const {a,d,w}=await setup(t);
  const raw=structuredClone(w.PIGEON_DECK_BUNDLE.json['public/deck/manifest.json']);
  delete raw.slideTransition;
  assert.equal(a.normaliseManifest(raw).slideTransition,'camera');
  assert.equal(d.querySelector('#slideTransitionSelect').value,'camera');
  a.nextSlide();
  assert.match(d.querySelector('#canvasWorld').style.transition,/\.38s cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.equal(d.querySelectorAll('.page-transition-overlay').length,0);
});

test('About Pigeon is available directly and from the keyboard guide',async t=>{
  const {d,w}=await setup(t);
  assert.equal(d.querySelector('#aboutButton').getAttribute('aria-label'),'About Pigeon');
  assert.match(d.querySelector('#aboutDialog').textContent,/Version 1\.0\.0/);
  assert.match(d.querySelector('#aboutDialog').textContent,/typst-to-pigeon talk\.typ/);
  assert.match(d.querySelector('#aboutDialog').textContent,/ordinary blocks, images, and tables/);
  assert.match(d.querySelector('#aboutDialog').textContent,/#takeaway\(message\)/);
  assert.ok(d.querySelector('#aboutFromHelp'));
  d.querySelector('#helpButton').click();
  assert.equal(d.querySelector('#helpDialog').open,true);
  d.querySelector('#aboutFromHelp').click();
  assert.equal(d.querySelector('#helpDialog').open,false);
  assert.equal(d.querySelector('#aboutDialog').open,true);
  d.querySelector('#aboutDialog [data-close="aboutDialog"]').click();
  assert.equal(d.querySelector('#aboutDialog').open,false);
});

test('every optional transition settles on the real target and starts its title afterward',async t=>{
  const {a,d,w,calls}=await setup(t);
  for(const name of w.PigeonTransitions.names.filter(n=>!['camera','none'].includes(n))){
    const select=d.querySelector('#slideTransitionSelect');
    select.value=name;select.dispatchEvent(new w.Event('change'));
    a.navigateTo(a.state.currentId==='intro'?'portrait':'intro');
    const overlay=d.querySelector('.page-transition-overlay');
    assert.equal(overlay?.dataset.transition,name);
    assert.equal(overlay.getAttribute('aria-hidden'),'true');
    assert.ok(overlay.querySelector('canvas'),'snapshot retains outgoing ink');
    assert.equal(d.querySelectorAll('.slide-frame').length,3,'no cloned interactive frames');
    assert.equal(d.querySelector('.slide-frame.current .title-artwork'),null,'title waits for transition');
    await new Promise(r=>setTimeout(r,750));
    assert.equal(d.querySelectorAll('.page-transition-overlay, clipPath').length,0);
    assert.equal(a.pageTransitions.active,false);
    assert.ok(d.querySelector('.slide-frame.current .title-artwork'));
  }
  assert.ok(calls.filter(c=>!c.element.closest('.title-artwork')).every(c=>c.cancelled));
});

test('rapid changes, zoom and reduced motion cancel page effects without losing the active tool',async t=>{
  const {a,d,w}=await setup(t);
  a.state.slideTransition='pixel';a.setTool('pen');
  a.nextSlide();a.nextSlide();
  assert.equal(a.state.currentId,'03');assert.equal(a.state.tool,'pen');
  assert.equal(d.querySelectorAll('.page-transition-overlay').length,1);
  a.zoomAt(2);
  assert.equal(d.querySelectorAll('.page-transition-overlay, clipPath').length,0);
  a.state.reducedMotion=true;a.navigateTo('intro');
  assert.equal(d.querySelectorAll('.page-transition-overlay').length,0);
  assert.equal(d.querySelector('#canvasWorld').style.transition,'none');
  a.state.reducedMotion=false;a.state.slideTransition='none';a.nextSlide();
  assert.equal(d.querySelectorAll('.page-transition-overlay').length,0);
  assert.equal(d.querySelector('#canvasWorld').style.transition,'none');
  const select=d.querySelector('#slideTransitionSelect');
  select.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(a.state.currentId,'portrait');
});

test('slide direction reverses, presentation boards recover, and resume clears an in-flight transition',async t=>{
  const {a,d,calls}=await setup(t);
  a.state.slideTransition='slide';a.nextSlide();
  const forward=calls.findLast(c=>c.element.matches('.slide-frame'));
  assert.match(forward.frames[0].transform,/translateX\(100%\)/);
  a.nextSlide(-1);
  const backward=calls.findLast(c=>c.element.matches('.slide-frame'));
  assert.match(backward.frames[0].transform,/translateX\(-100%\)/);
  a.reconcilePresentation(true);
  await new Promise(r=>setTimeout(r,25));
  a.toggleWhiteboard();assert.equal(a.state.whiteboard,true);
  a.toggleWhiteboard();assert.equal(a.state.whiteboard,false);
  assert.equal(a.state.currentId,'intro');
  a.navigateTo('03',{detour:true});a.resumeRoute();
  assert.equal(a.state.currentId,'intro');
  assert.equal(d.querySelectorAll('.page-transition-overlay').length,0);
});
