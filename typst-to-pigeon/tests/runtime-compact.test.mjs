import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './runtime-harness.mjs';

test('a static build ignores stored title animation and disables its selector',async t=>{
  const {a,d}=await setup(t,{mutateBundle(bundle,w){
    const manifest=bundle.json['public/deck/manifest.json'];
    manifest.titleEffect='none';
    manifest.slides.forEach(slide=>{slide.titleLayer=null;});
    w.localStorage.setItem(`pigeon-title-effect:${manifest.deckId}`,'split-text');
  }});
  assert.equal(a.state.titleEffect,'none');
  assert.equal(d.querySelector('#titleEffectSelect').disabled,true);
  assert.equal(d.querySelectorAll('.title-artwork').length,0);
});

test('missing embedded PDF disables PDF actions without breaking slides',async t=>{
  const {d}=await setup(t,{mutateBundle(bundle){
    const manifest=bundle.json['public/deck/manifest.json'];
    delete bundle.assets['public/deck/'+manifest.pdf];
  }});
  assert.equal(d.querySelector('#exportPdfButton').disabled,true);
  assert.equal(d.querySelector('#pdfLink').getAttribute('aria-disabled'),'true');
  assert.match(d.querySelector('#readyState').textContent,/Ready offline/);
  assert.ok(d.querySelector('.slide-frame.current'));
});

for (const found of [true,false]) test(`HTTP companion PDF ${found?'found':'missing'} keeps annotated export disabled`,async t=>{
  let bundle;
  const {a,d}=await setup(t,{
    url:'http://localhost/deck/index.html',
    mutateBundle(value){
      bundle=value;
      Object.assign(bundle.json['public/deck/manifest.json'],{pdfEmbedded:false,pdf:'My%20talk.pdf'});
    },
    async fetch(path){
      if(bundle.json[path]) return {ok:true,json:async()=>structuredClone(bundle.json[path]),arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(bundle.json[path])).buffer};
      if(path==='My%20talk.pdf') return {ok:found,status:404,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7\nfixture').buffer};
      const bytes=Buffer.from(bundle.assets[path]?.split(',')[1] || '', 'base64');
      return {ok:true,text:async()=>bytes.toString(),arrayBuffer:async()=>new Uint8Array(bytes).buffer};
    }
  });
  assert.equal(a.state.deck.pdf,'My%20talk.pdf');
  assert.equal(d.querySelector('#exportPdfButton').disabled,true);
  assert.equal(d.querySelector('#pdfLink').getAttribute('aria-disabled'),String(!found));
  assert.equal(d.querySelector('#choosePdfLabel').hidden,found);
  assert.match(d.querySelector('#readyState').textContent,/Ready offline/);
});

test('local companion fetch rejection exposes a PDF picker and grays PDF actions',async t=>{
  const {d}=await setup(t,{mutateBundle(bundle){
    Object.assign(bundle.json['public/deck/manifest.json'],{pdfEmbedded:false,pdf:'companion.pdf'});
  }});
  assert.equal(d.querySelector('#exportPdfButton').disabled,true);
  assert.equal(d.querySelector('#pdfLink').getAttribute('aria-disabled'),'true');
  assert.equal(d.querySelector('#choosePdfLabel').hidden,false);
});

test('choosing a local PDF enables fallback while annotated export remains gray',async t=>{
  const {a,d,w}=await setup(t,{mutateBundle(bundle){
    Object.assign(bundle.json['public/deck/manifest.json'],{pdfEmbedded:false,pdf:'companion.pdf'});
  }});
  const input=d.querySelector('#choosePdfInput');
  Object.defineProperty(input,'files',{value:[new w.File(['%PDF-1.7\nfixture'],'companion.pdf',{type:'application/pdf'})]});
  let opened;
  w.URL.createObjectURL=()=> 'blob:chosen-pdf';
  w.open=url=>{opened=url;};
  input.dispatchEvent(new w.Event('change'));
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(d.querySelector('#pdfLink').getAttribute('aria-disabled'),'false');
  assert.equal(d.querySelector('#exportPdfButton').disabled,true);
  d.querySelector('#pdfLink').click();
  assert.equal(opened,'blob:chosen-pdf');
  assert.equal(a.state.deck.pdfEmbedded,false);
});

test('a hosted standalone HTML discovers only its external companion PDF',async t=>{
  const requests=[];
  const {d}=await setup(t,{
    url:'http://localhost/deck/compact.html',
    mutateBundle(bundle,w){
      w.PIGEON_SINGLE_FILE=true;
      Object.assign(bundle.json['public/deck/manifest.json'],{pdfEmbedded:false,pdf:'compact.pdf'});
      w.URL.createObjectURL=()=> 'blob:companion';
    },
    async fetch(path){
      requests.push(path);
      return {ok:true,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7\nfixture').buffer};
    }
  });
  assert.deepEqual(requests,['compact.pdf']);
  assert.equal(d.querySelector('#pdfLink').getAttribute('aria-disabled'),'false');
  assert.equal(d.querySelector('#exportPdfButton').disabled,true);
});
