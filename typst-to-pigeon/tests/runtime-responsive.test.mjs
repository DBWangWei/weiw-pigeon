import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './runtime-harness.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
function viewport(w,d,width,height) {
  d.querySelector('#stage').getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width,height,right:width,bottom:height});
  w.dispatchEvent(new w.Event('resize'));
}
function frameCenter(a,d,id=a.state.currentId) {
  const frame=d.querySelector(`[data-frame-key="slide:${id}"]`);
  return {x:parseFloat(frame.style.left)+parseFloat(frame.style.width)/2,
          y:parseFloat(frame.style.top)+parseFloat(frame.style.height)/2};
}
function centered(a,d,id=a.state.currentId) {
  const p=frameCenter(a,d,id),c=a.state.camera;
  assert(Math.abs(p.x*c.scale+c.x)<.01, 'slide center x follows the viewport');
  assert(Math.abs(p.y*c.scale+c.y)<.01, 'slide center y follows the viewport');
}
test('legacy camera reopening fits current slide and retains annotations',async t=>{
  const first=await setup(t);
  const saved=plain(first.a.sessionPayload());
  delete saved.cameraLayoutVersion;delete saved.canvasColumns;delete saved.autoFit;delete saved.cameraFit;
  saved.currentId='portrait';saved.camera={x:10000,y:10000,scale:.5};
  saved.annotations.portrait=[{type:'stroke',tool:'pen',color:'#DC2626',opacity:1,width:4,points:[{x:40,y:60}]}];
  const {a,d}=await setup(t,{session:saved});
  centered(a,d,'portrait');
  assert.equal(a.state.annotations.portrait[0].points[0].x,40);
  assert.equal(a.state.autoFit,true);
});
test('whole deck stays fitted after resize, including while overview is open',async t=>{
  const {w,a,d}=await setup(t);
  viewport(w,d,5120,1312);a.fitWhole();a.openOverview();
  viewport(w,d,900,1472);a.closeOverview();
  const stage=d.querySelector('#stage').getBoundingClientRect(),c=a.state.camera;
  for(const frame of d.querySelectorAll('.slide-frame')) {
    const x=stage.width/2+c.x+parseFloat(frame.style.left)*c.scale;
    const y=stage.height/2+c.y+parseFloat(frame.style.top)*c.scale;
    assert(x>=-1 && y>=-1 && x+parseFloat(frame.style.width)*c.scale<=stage.width+1 && y+parseFloat(frame.style.height)*c.scale<=stage.height+1,'all frames stay visible');
  }
});
test('resize repositions history and detour cameras together with frames',async t=>{
  const {w,a,d}=await setup(t);
  a.fitCurrent(false);a.navigateTo('portrait',{detour:true});
  viewport(w,d,5120,1312);
  a.resumeRoute();centered(a,d,'intro');
  a.navigateTo('portrait');viewport(w,d,900,1472);
  a.historyMove(-1);centered(a,d,'intro');
});
test('whole-deck fit is retained on reopening at another aspect ratio',async t=>{
  const {w,a,d}=await setup(t);viewport(w,d,5120,1312);a.fitWhole();
  const saved=plain(a.sessionPayload());
  const next=await setup(t,{session:saved});
  assert.equal(next.a.state.cameraFit,'deck');
  assert.equal(next.a.state.autoFit,true);
});
test('imported board layout can be validated repeatedly without moving cameras twice',async t=>{
  const source=await setup(t);
  for(let i=0;i<12;i++) source.a.state.boardMeta[`intro::Board ${i}`]={color:'white',kept:true,inserted:true};
  source.a.fitCurrent(false);
  const saved=plain(source.a.sessionPayload());
  const target=await setup(t);
  const once=target.a.validateSession(saved),twice=target.a.validateSession(plain(once));
  assert.equal(once.canvasColumns,saved.canvasColumns);
  assert.deepEqual(plain(twice.camera),plain(once.camera));
  assert.deepEqual(plain(twice.history),plain(once.history));
});
