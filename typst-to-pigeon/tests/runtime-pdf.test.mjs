// Run against examples/pdf/pigeon-geometry; the shared harness forbids fetch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,press,pointer} from './runtime-harness.mjs';

test('PDF bundle loads offline with untitled pages, graph, search and page jumps',async t=>{
  const {a,d,w}=await setup(t);
  assert.match(d.querySelector('#readyState').textContent,/Ready offline/);
  assert.equal(a.state.deck.slides.length,9);
  assert.ok(a.state.graph.concepts.length>0);
  assert.ok(a.state.graph.relationships.length>0);
  assert.equal(a.state.deck.slides[1].navigationLabel,'Slide 2');
  assert.equal(a.state.deck.slides[1].titleLayer,null);
  a.navigateTo('02');await new Promise(r=>setTimeout(r,10));
  assert.equal(d.querySelector('.slide-frame.current .title-artwork'),null);
  press(w,d,'o');assert.equal(d.querySelectorAll('.slide-tile').length,9);
  press(w,d,'ArrowRight');press(w,d,'Enter');
  assert.equal(a.state.currentId,'03');assert.equal(a.state.overview,false);
  press(w,d,'/');
  const input=d.querySelector('#searchInput');input.value='Borderless';
  input.dispatchEvent(new w.Event('input'));
  assert.ok(a.state.searchResults.some(r=>r.id==='05'));
  d.querySelector(`.search-result[data-result="${a.state.searchResults.findIndex(r=>r.id==='05')}"]`).click();
  assert.equal(a.state.currentId,'05');
  press(w,d,'g');input.value='#8';input.dispatchEvent(new w.Event('input'));
  d.querySelector('.search-result').click();assert.equal(a.state.currentId,'08');
  assert.equal(d.querySelector('.slide-frame.current canvas').width,400);
  assert.equal(d.querySelector('.slide-frame.current canvas').height,600);
});

test('PDF images and tables respond to the wand; native titles and pen down remain available',async t=>{
  const {a,d,w}=await setup(t);a.navigateTo('04');
  await new Promise(r=>setTimeout(r,15));
  assert.ok(d.querySelector('.slide-frame.current .pigeon-title-glyph'));
  a.setTool('wand');
  for(const kind of ['table','image']){
    const slide=a.state.deck.slides.find(s=>s.id==='04');
    const region=slide.wandRegions.find(r=>r.kind===kind);
    a.showWand({clientX:(region.x+region.width/2)/slide.width*1440,
      clientY:(region.y+region.height/2)/slide.height*1000});
    assert.equal(d.querySelector('.wand-highlight')?.dataset.kind,kind);
    assert.equal(d.querySelector('.wand-shade'),null,'PDF has no inferred takeaway spotlight');
  }
  press(w,d,'p');press(w,d,'`');
  pointer(w,d.querySelector('.slide-frame.current canvas'));
  press(w,d,'ArrowRight');assert.equal(a.state.annotations['04'].length,1);
  assert.equal(a.state.stickyPen,true);assert.equal(a.state.tool,'pen');
  assert.equal(d.querySelector('#penDownIndicator').hidden,false);
});
