import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './runtime-harness.mjs';
test('the default mind map never scrolls the document while overview is closed', async t => {
  const documentScrolls = [];
  const {w, a} = await setup(t, {mutateBundle(_bundle, window) {
    window.Element.prototype.scrollIntoView = function () {
      if (this.matches('.graph-node')) documentScrolls.push(this.closest('#overviewPanel')?.classList.contains('open') || false);
    };
  }});
  await new Promise(resolve => w.requestAnimationFrame(resolve));
  assert.deepEqual(documentScrolls, [], 'startup must not reveal the offscreen graph');
  a.navigateTo(a.state.deck.slides[1].id);
  await new Promise(resolve => w.requestAnimationFrame(resolve));
  assert.deepEqual(documentScrolls, [], 'slide navigation must not reveal the offscreen graph');
});
test('revealing a graph node moves only the graph scroll container', async t => {
  const {w, d, a} = await setup(t);
  a.openOverview();
  await new Promise(resolve => w.requestAnimationFrame(resolve));
  const scroll = d.querySelector('.graph-scroll');
  const node = d.querySelector('.graph-node');
  Object.defineProperties(scroll, {clientWidth: {value: 300}, clientHeight: {value: 200}});
  scroll.getBoundingClientRect = () => ({left: 100, top: 100});
  node.getBoundingClientRect = () => ({left: 450, top: 250, right: 550, bottom: 350});
  scroll.scrollLeft = 0;
  scroll.scrollTop = 0;
  node.scrollIntoView = () => assert.fail('must not scroll ancestor containers');
  const originalFocus = node.focus.bind(node);
  node.focus = options => {
    assert.equal(options?.preventScroll, true);
    originalFocus(options);
  };
  node.dispatchEvent(new w.MouseEvent('click', {bubbles: true}));
  assert.equal(scroll.scrollLeft, 150);
  assert.equal(scroll.scrollTop, 50);
  a.closeOverview();
  scroll.scrollLeft = 0;
  scroll.scrollTop = 0;
  node.dispatchEvent(new w.MouseEvent('click', {bubbles: true}));
  assert.equal(scroll.scrollLeft, 0);
  assert.equal(scroll.scrollTop, 0);
});
test('graph renders scalable cards, zoom controls and source evidence',async t=>{
  const {w,d,a}=await setup(t);
  assert.equal(a.state.graphError,null);
  assert.equal(a.state.mode,'graph');
  assert.equal(d.querySelector('.overview-tab[data-view="graph"]').getAttribute('aria-selected'),'true');
  a.state.mode='graph';a.openOverview();
  const svg=d.querySelector('.graph-canvas'),scroll=d.querySelector('.graph-scroll');
  assert(svg && scroll);
  assert.equal(d.querySelectorAll('.graph-node').length,a.state.graph.concepts.length);
  assert.equal(svg.querySelector('.node-shape').getAttribute('width'),'200');
  assert.equal(d.querySelector('#graphZoomLevel').textContent,'100%');
  const width=parseFloat(svg.style.width);
  d.querySelector('[data-graph-zoom="in"]').click();
  assert.equal(parseFloat(svg.style.width),width*1.25);
  d.querySelector('[data-graph-zoom="actual"]').click();
  assert.equal(parseFloat(svg.style.width),width);
  d.querySelector('[data-graph-zoom="fit"]').click();
  assert(parseFloat(svg.style.width)<=width);
  d.querySelector('.graph-node').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  assert(d.querySelector('#graphDetails .evidence-link'));
  assert(d.querySelector('#graphDetails h3').textContent);
  a.closeOverview();
});
test('rebuilding graph IDs retains saved annotations and resets only obsolete focus',async t=>{
  const {a}=await setup(t);
  const session=a.sessionPayload();
  session.graphFocus='slide-obsolete-extraction-id';
  session.annotations[session.currentId]=[{type:'stroke',tool:'pen',opacity:1,color:'#DC2626',width:4,points:[{x:10,y:10}]}];
  const restored=a.validateSession(session);
  assert.equal(restored.graphFocus,null);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.annotations)),JSON.parse(JSON.stringify(session.annotations)));
  session.graphFocus=42;
  assert.throws(()=>a.validateSession(session),/concept focus/);
});
