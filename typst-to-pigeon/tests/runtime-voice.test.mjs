import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup, press} from './runtime-harness.mjs';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function mark(a) {
  const slide = a.state.deck.slides[0];
  slide.semanticRegions = [
    {id:'table-1', target:'_table', x:40, y:80, width:250, height:100},
    {id:'message-1', target:'takeaway', x:40, y:350, width:500, height:60},
    {id:'message-2', target:'takeaway', x:40, y:430, width:500, height:60},
  ];
  return slide;
}

const commandConfig = [
  {id:'next-page', phrases:['next page'], command:'next_page'},
  {id:'previous-page', phrases:['previous page'], command:'previous_page'},
  {id:'go-to-page', phrases:['go to page'], command:'go_to_page'},
  {id:'full-screen', phrases:['full screen'], command:'fullscreen'},
  {id:'overview', phrases:['go to overview'], command:'overview'},
  {id:'graph-view', phrases:['go to graph view'], command:'graph'},
  {id:'pen-mode', phrases:['pen mode'], command:'pen'},
  {id:'highlight-mode', phrases:['highlight mode'], command:'highlighter'},
  {id:'wand-mode', phrases:['wand mode'], command:'wand'},
  {id:'diagram-mode', phrases:['diagram mode'], command:'diagram'},
  {id:'default-mode', phrases:['default mode'], command:'navigate'},
];

test('manifest normalization keeps only visible, valid semantic boxes', async t => {
  const {a,w} = await setup(t);
  const raw = structuredClone(w.PIGEON_DECK_BUNDLE.json['public/deck/manifest.json']);
  raw.slides[0].semanticRegions = [
    {id:'good', target:'_table', x:1, y:2, width:30, height:40},
    {id:'hidden', target:'_table', visible:false, x:1, y:2, width:30, height:40},
    {id:'bad', target:'_table', x:-1, y:2, width:30, height:40},
  ];
  assert.deepEqual(Array.from(a.normaliseManifest(raw).slides[0].semanticRegions, r=>r.id), ['good']);
  assert.equal(a.normaliseManifest(raw).voice.enabled, true);
  delete raw.voice;
  assert.equal(a.normaliseManifest(raw).voice.enabled, false, 'old presentations do not start recognition');
});

test('manual semantic actions use original bundled vectors and remain transient', async t => {
  const {a,d,w} = await setup(t); mark(a);
  assert.ok(a.voice);
  const stable = payload => { const copy = JSON.parse(JSON.stringify(payload)); delete copy.savedAt; return JSON.stringify(copy); };
  const before = stable(a.sessionPayload());
  press(w,d,'T',{shiftKey:true});
  const overlay = d.querySelector('.pigeon-voice-overlay');
  assert.ok(overlay);
  assert.equal(overlay.dataset.action,'pop');
  assert.match(overlay.querySelector('img').src,/^data:image\/svg\+xml/);
  assert.equal(stable(a.sessionPayload()),before);
  press(w,d,'Escape');
  assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
  assert.equal(a.state.tool,'navigate');
  press(w,d,'K',{shiftKey:true});
  assert.equal(d.querySelectorAll('.voice-pop-card').length,2);
  a.nextSlide();
  assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
});

test('diagnostic text tests use the app targets and keep reports out of saved sessions', async t => {
  const {a,d,w} = await setup(t); mark(a);
  a.voice.togglePanel();
  assert.ok(d.querySelector('.voice-diagnostics'));
  d.querySelector('.voice-test-input').value = 'this table';
  d.querySelector('.voice-test-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.equal(d.querySelectorAll('.voice-pop-card').length,1);
  assert.match(d.querySelector('[data-voice-stage="target"]').textContent,/table-1/);
  assert.match(d.querySelector('[data-voice-stage="action"]').textContent,/Typed test/);
  assert.match(d.querySelector('[data-voice-stage="text"]').textContent,/No recognition result/);
  d.querySelector('.voice-report-button').click();
  assert.equal(JSON.parse(d.querySelector('.voice-report').value).lastTest,'this table');
  assert.doesNotMatch(JSON.stringify(a.sessionPayload()),/diagnostics|lastResult|lastTest|this table/);
  a.openOverview();
  assert.match(d.querySelector('[data-voice-stage="target"]').textContent,/Paused in overview/);
});

test('voice shortcuts preserve Wand, Diagram, drawing and text-entry shortcuts', async t => {
  const {a,d,w} = await setup(t); mark(a);
  press(w,d,'m'); assert.equal(a.state.tool,'wand');
  press(w,d,'T',{shiftKey:true}); assert.ok(d.querySelector('.pigeon-voice-overlay'));
  press(w,d,'Escape'); assert.equal(a.state.tool,'wand');
  press(w,d,'d'); assert.equal(a.state.tool,'diagram');
  press(w,d,'T',{shiftKey:true});
  assert.equal(d.querySelector('.pigeon-voice-overlay'),null,'Diagram owns Shift+T');
  a.setTool('navigate');
  const input = d.querySelector('#boardNameInput');
  input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'T',shiftKey:true,bubbles:true}));
  assert.equal(d.querySelector('.pigeon-voice-overlay'),null,'typing is not a voice shortcut');
});

test('voice commands navigate, open views, enter tools, and clamp page numbers', async t => {
  const {a} = await setup(t, {voiceCommands: commandConfig});
  const page = (id, transcript, end) => a.voice.dispatch(id, 'typed', {transcript, match: {end}});
  assert.match(page('go-to-page', 'go to page 999', 10), /Page/);
  assert.equal(a.state.currentId, a.state.deck.slides.at(-1).id);
  page('previous-page', 'previous page', 14);
  assert.equal(a.state.currentId, a.state.deck.slides.at(-2).id);
  page('go-to-page', 'go to page one', 10);
  assert.equal(a.state.currentId, a.state.deck.slides[0].id);
  page('next-page', 'next page', 10);
  assert.equal(a.state.currentId, a.state.deck.slides[1].id);
  page('pen-mode', 'pen mode', 8); assert.equal(a.state.tool, 'pen');
  page('highlight-mode', 'highlight mode', 14); assert.equal(a.state.tool, 'highlighter');
  page('wand-mode', 'wand mode', 9); assert.equal(a.state.tool, 'wand');
  page('diagram-mode', 'diagram mode', 12); assert.equal(a.state.tool, 'diagram');
  page('default-mode', 'default mode', 12); assert.equal(a.state.tool, 'navigate');
  page('full-screen', 'full screen', 10); assert.equal(a.state.presentation, true);
  page('overview', 'go to overview', 14); assert.equal(a.state.overview, true);
  a.closeOverview();
  page('graph-view', 'go to graph view', 17);
  assert.equal(a.state.overview, true); assert.equal(a.state.mode, 'graph');
});

test('boards and overview reject semantic actions and dismiss the active crop', async t => {
  const {a,d} = await setup(t); mark(a);
  a.voice.dispatch('table','manual'); assert.ok(d.querySelector('.pigeon-voice-overlay'));
  a.toggleWhiteboard(); assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
  a.voice.dispatch('table','manual'); assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
  a.toggleWhiteboard();
  a.voice.dispatch('table','manual'); assert.ok(d.querySelector('.pigeon-voice-overlay'));
  a.openOverview(); assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
  a.voice.dispatch('table','manual'); assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
});

test('listening follows navigation, history, resume, imported sessions and paused views', async t => {
  const {a,d,w} = await setup(t, {voiceBackend:'browser'}); mark(a);
  let now = Date.now() + 10000;
  w.Date.now = () => now;
  const instances = [];
  class SR {
    static async available() { return 'available'; }
    constructor() { instances.push(this); }
    start(track) { this.track = track; this.onstart?.(); }
    abort() { this.aborted = true; }
    result() { this.onresult?.({resultIndex:0,results:[{0:{transcript:'this table'}}]}); }
  }
  SR.prototype.processLocally = false;
  w.SpeechRecognition = SR;
  Object.defineProperty(w.navigator, 'mediaDevices', {value: {async getUserMedia() {
    const track = {label: 'Runtime test microphone', kind: 'audio', enabled: true, muted: false, readyState: 'live',
      stop() { this.readyState = 'ended'; }, getSettings() { return {sampleRate: 48000, channelCount: 1}; }};
    return {getAudioTracks: () => [track], getTracks: () => [track]};
  }}});
  const active = () => instances.at(-1);
  await a.voice.start();
  assert.equal(active().track.label, 'Runtime test microphone');
  active().result(); assert.ok(d.querySelector('.pigeon-voice-overlay'));
  const old = active(), late = old.onresult;
  const beforeNavigation = instances.length;
  a.navigateTo('portrait'); await flush(); now += 1000;
  assert.equal(instances.length,beforeNavigation + 1,'navigation starts one replacement recognizer');
  assert.equal(old.aborted,true); assert.notEqual(active(),old);
  late({resultIndex:0,results:[{0:{transcript:'this table'}}]});
  assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
  a.historyMove(-1); await flush(); now += 1000;
  active().result(); assert.ok(d.querySelector('.pigeon-voice-overlay'));
  a.navigateTo('03',{detour:true}); await flush(); now += 1000;
  a.resumeRoute(); await flush(); now += 1000;
  active().result(); assert.ok(d.querySelector('.pigeon-voice-overlay'));
  const payload = a.sessionPayload(); payload.currentId = 'portrait';
  const beforeImport = active();
  await a.replaceSessionSafely(payload); now += 1000;
  assert.equal(beforeImport.aborted,true);
  assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
  a.navigateTo('intro'); await flush(); now += 1000;
  active().result(); assert.ok(d.querySelector('.pigeon-voice-overlay'));
  a.openOverview(); assert.equal(a.voice.snapshot().state,'paused');
  assert.equal(d.querySelector('.pigeon-voice-overlay'),null);
  a.closeOverview(); await flush(); assert.equal(a.voice.snapshot().state,'listening');
  a.toggleBlackout(true); assert.equal(a.voice.snapshot().state,'paused');
  a.toggleBlackout(false); await flush(); assert.equal(a.voice.snapshot().state,'listening');
  d.querySelector('#helpButton').click();
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(a.voice.snapshot().state,'paused');
  d.querySelector('#helpDialog').close();
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(a.voice.snapshot().state,'listening');
  a.voice.stop();
});
