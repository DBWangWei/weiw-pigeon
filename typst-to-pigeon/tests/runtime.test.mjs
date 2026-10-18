import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,press,pointer} from './runtime-harness.mjs';

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
  assert.match(d.querySelector('#aboutDialog').textContent,/Version 1\.0\.2/);
  assert.ok(d.querySelector('#aboutDialog img.about-icon'));
  assert.match(d.querySelector('#aboutDialog').textContent,/Wei Wang \(weiwcs AT ust\.hk\)/);
  assert.doesNotMatch(d.querySelector('#aboutDialog').textContent,/Typical use|typst-to-pigeon talk/);
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

test('backtick toggles button-free pen strokes and lifting keeps ordinary Pen selected',async t=>{
  const {a,d,w}=await setup(t);
  const canvas=d.querySelector('.slide-frame.current canvas');
  press(w,d,'`');assert.equal(a.state.stickyPen,false,'requires Pen first');
  press(w,d,'p');press(w,d,'`');
  assert.equal(a.state.stickyPen,true);
  assert.equal(d.querySelector('#penDownIndicator').hidden,false);
  assert.match(d.querySelector('#penDownIndicator').textContent,/Pen down mode/);
  press(w,d,'`',{repeat:true});assert.equal(a.state.stickyPen,true);
  pointer(w,canvas);pointer(w,canvas,'pointermove',{clientX:200});
  assert.equal(a.state.currentStroke.points.length,2);
  pointer(w,canvas,'pointerup');assert.ok(a.state.currentStroke,'button up does not lift sticky pen');
  press(w,d,'`');
  assert.equal(a.state.tool,'pen');assert.equal(a.state.stickyPen,false);
  assert.equal(a.state.currentStroke,null);
  assert.equal(d.querySelector('#penDownIndicator').hidden,true);
  assert.equal(a.state.annotations.intro.length,1);
  assert.equal(a.state.annotations.intro[0].sticky,undefined,'transient drawing mode is not saved');
  pointer(w,canvas);assert.equal(a.state.currentStroke,null,'ordinary Pen needs held button');
  pointer(w,canvas,'pointerdown',{buttons:1});
  pointer(w,canvas,'pointermove',{buttons:1,clientX:260});
  pointer(w,canvas,'pointerup');
  assert.equal(a.state.annotations.intro.length,2);
  assert.equal(a.state.currentStroke,null);
  assert.equal(a.validateSession(a.sessionPayload()).annotations.intro.length,2);
});

test('sticky navigation, pointer boundaries and zoom create separate strokes without changing tool',async t=>{
  const {a,d,w}=await setup(t);press(w,d,'p');press(w,d,'`');
  let canvas=d.querySelector('.slide-frame.current canvas');
  pointer(w,canvas);pointer(w,canvas,'pointerleave');
  pointer(w,canvas,'pointermove',{clientX:500});
  assert.equal(a.state.currentStroke.points.length,1,'reentering starts a separate stroke');
  press(w,d,'ArrowRight');
  assert.equal(a.state.currentId,'portrait');assert.equal(a.state.stickyPen,true);
  assert.equal(a.state.annotations.intro.length,2);assert.equal(a.state.currentStroke,null);
  canvas=d.querySelector('.slide-frame.current canvas');pointer(w,canvas);
  assert.equal(a.state.currentStroke.points.length,1);
  const scale=a.state.camera.scale;press(w,d,'+');
  assert.ok(a.state.camera.scale>scale);assert.equal(a.state.currentStroke,null);
  pointer(w,canvas);assert.equal(a.state.currentStroke.points.length,1,'zoom cannot connect transformed coordinates');
  press(w,d,'Escape');
  assert.equal(a.state.stickyPen,false);assert.equal(a.state.tool,'pen');
  press(w,d,'`');press(w,d,'h');
  assert.equal(a.state.tool,'highlighter');assert.equal(a.state.stickyPen,false);
  press(w,d,'p');press(w,d,'`');press(w,d,'p');
  assert.equal(a.state.tool,'navigate');assert.equal(a.state.stickyPen,false);
});

test('dialogs, overview and window blur prevent accidental sticky drawing',async t=>{
  const {a,d,w}=await setup(t);press(w,d,'p');press(w,d,'`');
  const canvas=d.querySelector('.slide-frame.current canvas');pointer(w,canvas);
  press(w,d,'?');
  await new Promise(r=>setTimeout(r,5));
  assert.equal(a.state.currentStroke,null);
  pointer(w,canvas);assert.equal(a.state.currentStroke,null);
  press(w,d,'Escape');
  assert.equal(d.querySelector('#helpDialog').open,false);
  assert.equal(a.state.stickyPen,true,'Escape closes the dialog before lifting the pen');
  press(w,d,'o');pointer(w,canvas);assert.equal(a.state.currentStroke,null);
  press(w,d,'o');pointer(w,canvas);assert.ok(a.state.currentStroke);
  w.dispatchEvent(new w.Event('blur'));
  assert.equal(a.state.currentStroke,null);assert.equal(a.state.stickyPen,false);
  assert.equal(a.state.tool,'pen');assert.equal(d.querySelector('#penDownIndicator').hidden,true);
});

test('sticky strokes support undo, boards, and held Space panning',async t=>{
  const {a,d,w}=await setup(t);press(w,d,'p');press(w,d,'`');
  let canvas=d.querySelector('.slide-frame.current canvas');pointer(w,canvas);
  press(w,d,'z',{ctrlKey:true});assert.equal(a.state.annotations.intro.length,0);
  pointer(w,canvas);press(w,d,'w');
  assert.equal(a.state.whiteboard,true);assert.equal(a.state.stickyPen,true);
  canvas=d.querySelector('.slide-frame.current canvas');pointer(w,canvas);
  press(w,d,' ');assert.equal(a.state.currentStroke,null);
  pointer(w,canvas);assert.equal(a.state.currentStroke,null,'Space pauses drawing for panning');
  canvas.dispatchEvent(new w.PointerEvent('pointerdown',{pointerId:1,button:0,bubbles:true}));
  d.querySelector('#stage').dispatchEvent(new w.KeyboardEvent('keyup',{key:' ',bubbles:true}));
  pointer(w,canvas);press(w,d,'`');
  assert.equal(a.state.tool,'pen');
  assert.equal(Object.values(a.state.boards).flat().length,2);
  assert.equal(Object.values(a.validateSession(a.sessionPayload()).boards).flat().length,2);
  press(w,d,'w');assert.equal(a.state.whiteboard,false);
  assert.equal(a.state.annotations.intro.length,1,'board ink never leaks onto the source slide');
});

test('a full-page scan image lets the wand emphasize an extracted text block',async t=>{
  const {a,d}=await setup(t);const slide=a.state.deck.slides[0];
  slide.wandRegions=[{id:'scan',kind:'image',x:0,y:0,width:slide.width,height:slide.height},
    {id:'ocr-block',kind:'text',x:40,y:40,width:200,height:100}];
  a.setTool('wand');a.showWand({clientX:100/slide.width*1440,clientY:80/slide.height*1000});
  assert.equal(d.querySelector('.wand-highlight').dataset.region,'ocr-block');
});

test('outline section labels group overview slides and arrow navigation crosses sections', async t => {
  const {a,d,w} = await setup(t);
  const manifest=structuredClone(w.PIGEON_DECK_BUNDLE.json['public/deck/manifest.json']);
  manifest.hierarchy=null;
  manifest.slides.forEach((s,i)=>s.section=i<2?'1. Foundations':'2. Practice');
  a.state.deck=a.normaliseManifest(manifest);
  a.openOverview();
  const sections=[...d.querySelectorAll('.section-block')];
  assert.equal(sections.length,2);assert.match(sections[0].textContent,/1\. Foundations/);
  assert.equal(sections[0].querySelectorAll('.slide-tile').length,2);assert.match(sections[1].textContent,/2\. Practice/);
  press(w,d,'ArrowDown');press(w,d,'ArrowDown');
  assert.equal(d.activeElement.dataset.jump,'03');press(w,d,'Enter');assert.equal(a.state.currentId,'03');
  assert.equal(a.state.overview,false);
});
