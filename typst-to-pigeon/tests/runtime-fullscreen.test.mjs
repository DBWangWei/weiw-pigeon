import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,press} from './runtime-harness.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fullscreen(env, lock) {
  const {d,w}=env,counts={requests:0,exits:0,locks:[],unlocks:0};
  let element=null;
  Object.defineProperty(d,'fullscreenElement',{configurable:true,get:()=>element});
  Object.defineProperty(w.navigator,'keyboard',{configurable:true,value:lock ? {
    lock(keys){counts.locks.push(Array.from(keys));return lock();},
    unlock(){counts.unlocks++;},
  }:undefined});
  const exit=()=>{element=null;d.dispatchEvent(new w.Event('fullscreenchange'));};
  d.documentElement.requestFullscreen=async()=>{
    counts.requests++;element=d.documentElement;d.dispatchEvent(new w.Event('fullscreenchange'));
  };
  d.exitFullscreen=async()=>{counts.exits++;exit();};
  return {counts,exit};
}

test('fullscreen Escape dismisses Help first, ignores held-key repeats, then permits an intentional exit',async t=>{
  const env=await setup(t),{a,d,w}=env;
  const {counts}=fullscreen(env,async()=>{});
  press(w,d,'f');await tick();assert.deepEqual(counts.locks,[['Escape']]);
  d.querySelector('#helpButton').click();press(w,d,'Escape');
  assert.equal(d.querySelector('#helpDialog').open,false);
  assert.equal(d.fullscreenElement,d.documentElement);assert.equal(a.state.presentation,true);assert.equal(counts.exits,0);
  press(w,d,'Escape',{repeat:true});assert.equal(counts.exits,0);
  press(w,d,'Escape');await tick();assert.equal(counts.exits,1);
  assert.equal(a.state.presentation,false);assert.equal(d.fullscreenElement,null);assert.ok(counts.unlocks>0);
});

test('unsupported browsers preserve presentation layout when fullscreenchange arrives after the Help key handler',async t=>{
  const env=await setup(t),{a,d,w}=env;const {counts,exit}=fullscreen(env);
  press(w,d,'f');press(w,d,'?');press(w,d,'?');
  assert.equal(d.querySelector('#helpDialog').open,false);assert.equal(d.fullscreenElement,d.documentElement);
  press(w,d,'?');press(w,d,'Escape');exit();
  assert.equal(d.querySelector('#helpDialog').open,false);assert.equal(a.state.presentation,true);
  assert.equal(d.fullscreenElement,null,'native fullscreen cannot be retained without browser support');
  assert.equal(counts.requests,1,'never force fullscreen back on');
  press(w,d,'f');assert.equal(a.state.presentation,false);
});

test('native dialog cancellation before fullscreenchange preserves presentation layout',async t=>{
  const env=await setup(t),{a,d,w}=env;const {exit}=fullscreen(env);
  press(w,d,'f');press(w,d,'?');
  const event=new w.Event('cancel',{cancelable:true});d.querySelector('#helpDialog').dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);exit();
  assert.equal(d.querySelector('#helpDialog').open,false);assert.equal(a.state.presentation,true);
});

test('fullscreenchange before Help closes dismisses it; an ordinary fullscreen exit leaves presentation mode',async t=>{
  const env=await setup(t),{a,d,w}=env;const {exit}=fullscreen(env);
  press(w,d,'f');press(w,d,'?');exit();
  assert.equal(d.querySelector('#helpDialog').open,false);assert.equal(a.state.presentation,true);
  press(w,d,'f');press(w,d,'f');exit();assert.equal(a.state.presentation,false);
});

test('denied Escape locks fall back cleanly and late lock completion after exit is released',async t=>{
  const env=await setup(t),{a,d,w}=env;
  const denied=fullscreen(env,async()=>{throw new Error('Permission denied');});
  press(w,d,'f');await tick();assert.equal(denied.counts.locks.length,1);
  press(w,d,'?');press(w,d,'Escape');denied.exit();assert.equal(a.state.presentation,true);
  press(w,d,'f');
  let resolveLock;
  const pending=fullscreen(env,()=>new Promise(resolve=>{resolveLock=resolve;}));
  press(w,d,'f');press(w,d,'f');const before=pending.counts.unlocks;
  resolveLock();await tick();assert.ok(pending.counts.unlocks>before);assert.equal(a.state.presentation,false);
});
