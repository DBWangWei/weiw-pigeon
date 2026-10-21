import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const {Window} = await import(pathToFileURL(resolve(process.env.PIGEON_TEST_DEPS, 'happy-dom/lib/index.js')).href);
const source = await readFile(new URL('../assets/pigeon-template/src/voice-local.js', import.meta.url), 'utf8').catch(() => '');
const voiceSource = await readFile(new URL('../assets/pigeon-template/src/voice.js', import.meta.url), 'utf8');
const diagnosticsSource = await readFile(new URL('../assets/pigeon-template/src/voice-diagnostics.js', import.meta.url), 'utf8');
const captureSource = await readFile(new URL('../assets/pigeon-template/src/voice-capture-worklet.js', import.meta.url), 'utf8');
const flush = async () => { for (let i=0; i<25; i++) await Promise.resolve(); };
function setup(t) {
  const w = new Window({url: 'http://127.0.0.1:8766'});
  t.after(() => w.happyDOM.abort());
  const ports = [], contexts = [];
  w.AudioWorkletNode = class {
    constructor() { this.port = {}; ports.push(this.port); }
    connect() {} disconnect() {}
  };
  w.AudioContext = class {
    constructor() { this.audioWorklet = {addModule: async () => {}}; this.sampleRate=48000; contexts.push(this); }
    createMediaStreamSource() { return {connect() {}, disconnect() {}}; }
    createAnalyser() { return {fftSize:1024, getByteTimeDomainData(data) { data.fill(128); }}; }
    async resume() {} async close() { this.closed = true; }
  };
  w.MediaStream = class { constructor(tracks) { this.tracks=tracks; } };
  w.eval(source);
  assert.ok(w.PigeonLocalSpeech, 'local transcription adapter is available');
  return {w, ports, contexts};
}
const signal = (amplitude, frames=1) => new Float32Array(320 * frames).fill(amplitude);

for (const rate of [44100, 48000]) test(`capture preserves duration, level and mono mixing at ${rate} Hz`, () => {
  let Processor;
  const output=[];
  vm.runInNewContext(captureSource,{sampleRate:rate,AudioWorkletProcessor:class {
    constructor(){this.port={postMessage:frame=>output.push(new Float32Array(frame))};}
  },registerProcessor:(_name,value)=>{Processor=value;}});
  const processor=new Processor();
  for(let offset=0;offset<rate;offset+=128){
    const n=Math.min(128,rate-offset);
    processor.process([[new Float32Array(n).fill(.6),new Float32Array(n).fill(.2)]]);
  }
  assert.equal(output.reduce((sum,frame)=>sum+frame.length,0),16000);
  assert.ok(output.every(frame=>frame.every(value=>Math.abs(value-.4)<1e-6)));
});

test('brief noise is discarded and utterance timing survives fragmented capture messages', t => {
  const {w}=setup(t),segments=[];
  const gate=w.PigeonLocalSpeech.createSegmenter({onSegment:audio=>segments.push(audio)});
  gate.push(signal(.2,4)); gate.push(signal(0,50));
  assert.equal(segments.length,0);
  const audio=signal(.2,30);
  for(let i=0;i<audio.length;i+=127)gate.push(audio.slice(i,i+127));
  gate.push(signal(0,50));
  assert.equal(segments.length,1);
});

test('missing local engine fails before capture and never falls back to remote recognition', async t => {
  const {w,contexts}=setup(t);
  w.fetch=async()=>({ok:true,json:async()=>({available:false,detail:'Missing model; run setup'})});
  await assert.rejects(w.PigeonLocalSpeech.Recognition.available({langs:['en-US']}),/Missing model/);
  assert.equal(contexts.length,0);
});

test('silence never reaches Whisper; speech is delivered with its leading audio after a pause', t => {
  const {w} = setup(t), segments=[];
  const gate = w.PigeonLocalSpeech.createSegmenter({onSegment: value => segments.push(value)});
  gate.push(signal(0, 100)); assert.equal(segments.length, 0);
  gate.push(signal(.15, 30)); gate.push(signal(0, 40));
  assert.equal(segments.length, 1);
  assert.ok(segments[0].length >= 16000, 'pre-roll, speech and silence are retained');
  assert.ok(segments[0].some(value => value > .1));
  gate.push(signal(.1, 2000));
  assert.ok(segments.length > 2);
  assert.ok(segments.every(value => value.length <= 16000 * 12), 'continuous speech has bounded buffers');
});

test('chosen input is transcribed locally and abort discards a delayed reply and capture', async t => {
  const {w, ports, contexts} = setup(t);
  let reply, posted;
  w.fetch = async (url, options) => {
    if (url.endsWith('/status')) return {ok: true, json: async () => ({available:true, token:'local-token', model:'base.en', language:'en'})};
    posted = options;
    return new Promise(resolve => { reply=resolve; });
  };
  const SR = w.PigeonLocalSpeech.Recognition;
  assert.equal(await SR.available({langs:['en-US']}), 'available');
  const rec = new SR(), results=[];
  rec.onresult = event => results.push(event.results[event.resultIndex][0].transcript);
  const track = {kind:'audio', readyState:'live'};
  rec.start(track); await flush();
  ports[0].onmessage({data:signal(.15,30)}); ports[0].onmessage({data:signal(0,40)}); await flush();
  assert.ok(posted.body.byteLength > 16000);
  assert.equal(posted.headers['X-Pigeon-Voice-Token'], 'local-token');
  rec.abort();
  reply({ok:true, json:async()=>({text:'this table', durationMs:10})}); await flush();
  assert.deepEqual(results, []);
  assert.equal(posted.signal.aborted, true);
  assert.equal(contexts[0].closed, true);
});

test('transcription returns SpeechRecognition-shaped final results without reading the browser API', async t => {
  const {w, ports} = setup(t);
  Object.defineProperty(w, 'SpeechRecognition', {get() { throw Error('browser engine should not be accessed'); }});
  w.fetch = async url => ({ok:true, json:async()=>url.endsWith('/status')
    ? {available:true, token:'local-token', model:'base.en', language:'en'} : {text:'this table',durationMs:15}});
  const SR = w.PigeonLocalSpeech.Recognition;
  await SR.available({langs:['en-US']});
  const rec = new SR(), results=[];
  rec.onresult = e => results.push(e);
  rec.start({kind:'audio', readyState:'live'}); await flush();
  ports[0].onmessage({data:signal(.15,30)}); ports[0].onmessage({data:signal(0,40)}); await flush();
  assert.equal(results.length, 1);
  assert.equal(results[0].results[0].isFinal, true);
  assert.equal(results[0].results[0][0].transcript, 'this table');
  rec.abort();
});

test('default backend drives actual phrase actions, exposes local decode diagnostics and releases microphone', async t => {
  const {w, ports} = setup(t);
  Object.defineProperty(w, 'SpeechRecognition', {get() { throw Error('default backend must not read Chrome recognition'); }});
  const tracks=[];
  Object.defineProperty(w.navigator, 'mediaDevices', {value:{
    getUserMedia:async()=>{
      const track={kind:'audio',label:'USB input',readyState:'live',getSettings:()=>({sampleRate:48000}),stop(){this.readyState='ended';}};
      tracks.push(track); return {getAudioTracks:()=>[track],getTracks:()=>[track]};
    }, enumerateDevices:async()=>[],
  }});
  w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/status')
    ? {available:true,token:'token',model:'base.en',language:'en'} : {text:'this table',durationMs:15}});
  w.document.write('<div class="top-actions"></div><div class="slide-frame current"></div>');
  w.eval(diagnosticsSource); w.eval(voiceSource);
  const voice=w.PigeonVoice.create({config:{staleMs:0},getSlide:()=>({id:'one',page:1,width:800,height:600,
    semanticRegions:[{id:'a',target:'_table',x:10,y:10,width:100,height:100}]}),assetUrl:()=>'/slide.svg'});
  t.after(()=>voice.destroy());
  assert.equal(await voice.start(),true); await flush();
  ports[0].onmessage({data:signal(.2,30)}); ports[0].onmessage({data:signal(0,40)}); await flush();
  assert.ok(w.document.querySelector('.pigeon-voice-overlay'), 'decoded trigger displays emphasis');
  assert.match(voice.snapshot().diagnostics.stages.recognition.text,/local decode finished/i);
  assert.equal(voice.snapshot().diagnostics.environment.api,'Local Whisper');
  voice.stop(); assert.equal(tracks[0].readyState,'ended');
});
