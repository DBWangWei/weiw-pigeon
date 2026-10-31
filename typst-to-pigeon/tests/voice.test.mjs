import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const {Window} = await import(process.env.PIGEON_TEST_DEPS
  ? pathToFileURL(resolve(process.env.PIGEON_TEST_DEPS, "happy-dom/lib/index.js")).href : "happy-dom");
const source = await readFile(new URL("../assets/pigeon-template/src/voice.js", import.meta.url), "utf8");
const diagnosticsSource = await readFile(new URL("../assets/pigeon-template/src/voice-diagnostics.js", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; }
function fakeClock(w) {
  let now = 10000, nextId = 1;
  const timers = new Map(), RealDate = w.Date;
  w.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  w.setTimeout = (fn, delay = 0) => { const id = nextId++; timers.set(id, {at: now + Math.max(0, delay), fn}); return id; };
  w.clearTimeout = id => timers.delete(id);
  return {
    tick(ms) {
      const end = now + ms; let rounds = 0;
      for (;;) {
        const entry = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!entry) break;
        assert.ok(++rounds < 1000, "timer loop terminates");
        const [id, timer] = entry; timers.delete(id); now = timer.at; timer.fn();
      }
      now = end;
    },
    get pending() { return timers.size; },
  };
}
function speechAPI(w, options = {}) {
  const instances = [], checks = [], installs = [];
  class SR {
    constructor() { this.starts = 0; this.aborts = 0; this.stops = 0; instances.push(this); }
    static async available(arg) { checks.push(plain(arg)); return options.available ? options.available(checks.length) : "available"; }
    static async install(arg) { installs.push(plain(arg)); return options.install ? options.install() : true; }
    start(track) { this.starts++; this.inputTrack = track; if (options.start) options.start(this); else this.onstart?.(); }
    abort() { this.aborts++; if (options.abortThrows) throw Error("abort failed"); this.onend?.(); }
    stop() { this.stops++; this.onend?.(); }
    result(text, index = 0, isFinal = false) {
      const results = [];
      results[index] = {0: {transcript: text}, isFinal};
      this.onresult?.({resultIndex: index, results});
    }
    error(error) { this.onerror?.({error}); }
    end() { this.onend?.(); }
  }
  if (options.local !== false) SR.prototype.processLocally = false;
  if (options.readonlyLocal) Object.defineProperty(SR.prototype, "processLocally", {get: () => false, set: () => { throw Error("read only"); }});
  w.SpeechRecognition = SR;
  w.SpeechRecognitionPhrase = class {constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; }};
  return {SR, instances, checks, installs};
}
const region = (id, target = "_table", x = 20, y = 40, width = 180, height = 100) => ({id, target, x, y, width, height});
function setup(t, options = {}) {
  const w = new Window({url: "http://localhost:8000"});
  w.document.write('<div class="top-actions"></div><div class="slide-frame current"></div>');
  w.matchMedia = () => ({matches: Boolean(options.reducedMotion)});
  const animations = [];
  w.Element.prototype.animate = function(frames, params) { animations.push({node: this, frames, params}); return {cancel() {}}; };
  const clock = fakeClock(w), speech = speechAPI(w, options.speech);
  fakeMicrophone(w);
  w.eval(diagnosticsSource); w.eval(source);
  let slide = {id: "s1", page: 1, width: 960, height: 540, asset: "slide-1.svg", semanticRegions: options.regions ?? [region("table-1")]};
  let active = true, emphasis = 0;
  const commands = [];
  const transcripts = [];
  const voice = w.PigeonVoice.create({config: {backend: 'browser', cooldownMs: 300, staleMs: 60, restartDelayMs: 25, watchdogMs: 1000, resuppressAfterDismissMs: 1000, ...options.config},
    getSlide: () => slide, assetUrl: s => `/deck/${s.asset}`, getScale: () => 1, canDispatch: () => active, onEmphasis: () => emphasis++,
    onCommand: (command, detail) => { commands.push({command, detail}); return `handled ${command}`; },
    onTranscript: transcript => transcripts.push(transcript)});
  t.after(() => { voice.destroy(); w.happyDOM.abort(); });
  return {w, d: w.document, voice, clock, speech, animations,
    slide(value) { slide = {...slide, ...value}; }, active(value) { active = value; voice.contextChanged(); },
    commands, transcripts, get emphasis() { return emphasis; }};
}

test("Unicode phrase matching uses boundaries, longest synonyms and no bare take-away", t => {
  const {w} = setup(t);
  const {normalize, compileRules, matchRules} = w.PigeonVoice;
  assert.equal(normalize("ＴＨＩＳ take-away—message!"), "this takeaway message");
  const rules = compileRules([{id: "k", phrases: ["key message", "key messages", "takeaway", "takeaway message", "take away message"]},
    {id: "f", phrases: ["this plot"]}, {id: "zh", phrases: ["这张图", "关键信息"]}, {id: "accent", phrases: ["café"]}]);
  assert.deepEqual(plain(matchRules("the take-away message is key messages and takeaway", rules).map(m => m.phrase)), ["takeaway message", "key messages", "takeaway"]);
  assert.equal(matchRules("take away this term; notthis plotter; takeaways", rules).length, 0);
  assert.deepEqual(plain(matchRules("我们看这张图和关键信息。cafe\u0301", rules).map(m => m.ruleId)), ["zh", "zh", "accent"]);
  assert.equal(matchRules("this plot shows", rules)[0].ruleId, "f");
});

test("interim occurrence counts retain high-water marks through corrections", t => {
  const {w} = setup(t), {compileRules, matchRules, createOccurrenceTracker} = w.PigeonVoice;
  const rules = compileRules([{id: "table", phrases: ["this table", "table"]}]), tracker = createOccurrenceTracker();
  const consume = (text, index = 0) => plain(tracker.consume(index, matchRules(text, rules)));
  assert.deepEqual(consume("this tab"), []);
  assert.deepEqual(consume("this table"), ["table"]);
  assert.deepEqual(consume("this tab"), []);
  assert.deepEqual(consume("this table"), []);
  assert.deepEqual(consume("this table and this table"), ["table"]);
  assert.deepEqual(consume("this table", 1), ["table"]);
  tracker.clear(); assert.deepEqual(consume("table"), ["table"]);
});

test("command rules match and dispatch without semantic artwork targets", t => {
  const h = setup(t, {config: {enabled: false}});
  assert.equal(h.voice.dispatch("next-page", "typed", {transcript: "next page", match: {end: 10}}), "handled next_page");
  assert.equal(h.commands[0].command, "next_page");
  assert.equal(h.voice.dispatch("go-to-page", "typed", {transcript: "go to page 12", match: {end: 11}}), "handled go_to_page");
  assert.equal(h.commands[1].detail.transcript, "go to page 12");
  assert.equal(h.voice.snapshot().open, null);
});

test("page commands wait for a number before consuming an interim phrase", async t => {
  const h = setup(t);
  await h.voice.start();
  const rec = h.speech.instances[0];
  rec.result("go to page");
  assert.equal(h.commands.length, 0);
  h.clock.tick(60);
  rec.result("go to page 12", 1);
  assert.equal(h.commands[0].command, "go_to_page");
});

test("transcript callback receives final recognition results only", async t => {
  const h = setup(t);
  await h.voice.start();
  const rec = h.speech.instances[0];
  rec.result("the question is still being recognized");
  assert.equal(h.transcripts.length, 0);
  rec.result("the question and answer are complete", 1, true);
  assert.equal(h.transcripts.length, 1);
  assert.equal(h.transcripts[0].text, "the question and answer are complete");
});

test("disabled voice never reads, constructs or prepares a speech API; manual actions remain", async t => {
  const {w, voice, speech} = setup(t, {config: {enabled: false}});
  Object.defineProperty(w, "SpeechRecognition", {get() { throw Error("must not touch disabled API"); }});
  assert.equal(await voice.start(), false);
  assert.equal(voice.dispatch("table"), "shown");
  assert.deepEqual(speech.checks, []); assert.equal(speech.instances.length, 0);
  assert.equal(voice.snapshot().state, "disabled");
});

test("load never requests microphone; explicit start verifies local pack and sets local mode", async t => {
  const {voice, speech} = setup(t);
  assert.equal(speech.instances.length, 0); assert.equal(speech.checks.length, 0);
  assert.equal(await voice.start(), true);
  assert.deepEqual(speech.checks, [{langs: ["en-US"], processLocally: true}]);
  assert.equal(speech.instances[0].processLocally, true);
  assert.equal(speech.instances[0].continuous, true);
  assert.equal(speech.instances[0].interimResults, true);
  assert.equal(voice.snapshot().state, "listening");
});

test("diagnostics separate recognition, phrase matches, target resolution and blocked actions", async t => {
  const {voice, speech, clock, d} = setup(t);
  assert.ok(d.querySelector('.voice-diagnostics'));
  await voice.start();
  assert.equal(voice.snapshot().diagnostics.environment.localSupport, true);
  assert.equal(voice.snapshot().diagnostics.pack, 'available');
  const rec = speech.instances[0];
  rec.onaudiostart(); rec.onspeechstart();
  rec.result('I am talking but no keyword');
  assert.match(d.querySelector('[data-voice-stage="text"]').textContent, /I am talking but no keyword/);
  assert.match(d.querySelector('[data-voice-stage="match"]').textContent, /No trigger/);
  rec.result('this table', 1);
  assert.match(d.querySelector('[data-voice-stage="match"]').textContent, /this table/);
  assert.match(d.querySelector('[data-voice-stage="action"]').textContent, /slide change/i);
  clock.tick(60); rec.result('this table', 2);
  assert.match(d.querySelector('[data-voice-stage="target"]').textContent, /1.*_table/);
  assert.match(d.querySelector('[data-voice-stage="action"]').textContent, /pop/);
  rec.result('this table', 3);
  assert.match(d.querySelector('[data-voice-stage="action"]').textContent, /cooldown/i);
  clock.tick(300); voice.dismiss(); rec.result('this table', 4);
  assert.match(d.querySelector('[data-voice-stage="action"]').textContent, /dismiss/i);
  assert.equal(voice.snapshot().diagnostics.recognition.results, 5);
});

test("typed diagnostic tests exercise real matcher and effects without speech or microphone", t => {
  const {voice, speech, d, w} = setup(t, {config: {enabled: false}});
  d.querySelector('.voice-test-input').value = 'this table';
  d.querySelector('.voice-test-form').dispatchEvent(new w.Event('submit', {cancelable: true}));
  assert.equal(speech.instances.length, 0);
  assert.equal(voice.snapshot().open.ruleId, 'table');
  assert.equal(voice.snapshot().diagnostics.recognition.results, 0);
  assert.match(d.querySelector('[data-voice-stage="match"]').textContent, /Typed test/);
  assert.match(d.querySelector('[data-voice-stage="text"]').textContent, /No recognition result/);
  const img = d.querySelector('.voice-pop-artwork'); img.dispatchEvent(new w.Event('error'));
  assert.match(d.querySelector('[data-voice-stage="artwork"]').textContent, /failed/i);
  d.querySelector('.voice-report-button').click();
  const report = d.querySelector('.voice-report');
  assert.equal(report.hidden, false);
  assert.equal(JSON.parse(report.value).lastTest, 'this table');
});

function fakeMicrophone(w, {pending, deny} = {}) {
  const calls = [], newTrack = () => ({label: 'Test microphone', kind: 'audio', enabled: true, muted: false, readyState: 'live', stops: 0,
    getSettings() { return {sampleRate: 48000, channelCount: 1, deviceId: 'private-id'}; },
    stop() { this.stops++; this.readyState = 'ended'; }, addEventListener() {}, removeEventListener() {}});
  const track = newTrack();
  const stream = {getTracks: () => [track], getAudioTracks: () => [track]};
  Object.defineProperty(w.navigator, 'mediaDevices', {configurable: true, value: {
    getUserMedia: async options => {
      calls.push(options); if (deny) throw Object.assign(Error('Denied by browser'), {name: 'NotAllowedError'});
      if (pending) return pending.promise;
      if (calls.length === 1) return stream;
      const fresh = newTrack(); return {getTracks: () => [fresh], getAudioTracks: () => [fresh]};
    },
    enumerateDevices: async () => [
      {kind: 'audioinput', deviceId: 'builtin', label: 'MacBook Pro Microphone'},
      {kind: 'audioinput', deviceId: 'usb', label: 'USB Type-C Microphone'},
      {kind: 'audiooutput', deviceId: 'speaker', label: 'Speakers'}
    ]
  }});
  let amplitude = 0;
  const contexts = [];
  w.AudioContext = class {
    constructor() { this.closed = false; this.state = 'running'; contexts.push(this); }
    async resume() {}
    createMediaStreamSource() { return {connect() {}, disconnect() {}}; }
    createAnalyser() { return {fftSize: 1024, getByteTimeDomainData(data) { data.fill(128 + amplitude); }, disconnect() {}}; }
    async close() { this.closed = true; }
  };
  return {calls, track, stream, contexts, setAmplitude(value) { amplitude = value; }};
}

test("independent mic test measures input, reports silence and releases tracks on Stop", async t => {
  const {w, d, voice, clock, speech} = setup(t);
  const mic = fakeMicrophone(w);
  d.querySelector('.voice-mic-test').click(); await flush();
  assert.equal(mic.calls.length, 1); assert.equal(speech.instances.length, 0);
  assert.match(d.querySelector('[data-voice-stage="input"]').textContent, /quiet|silent/i);
  mic.setAmplitude(18); clock.tick(100);
  assert.ok(Number(d.querySelector('.voice-input-meter').value) > 0);
  assert.match(d.querySelector('[data-voice-stage="input"]').textContent, /signal detected/i);
  voice.stop();
  assert.equal(mic.track.stops, 1); assert.equal(mic.contexts[0].closed, true);
  assert.equal(clock.pending, 0);
});

test("default recognition receives the metered browser capture instead of opening a separate implicit input", async t => {
  const {w, d, voice, speech, clock} = setup(t);
  const mic = fakeMicrophone(w); mic.setAmplitude(18);
  await voice.start();
  assert.deepEqual(plain(mic.calls), [{audio: true, video: false}]);
  assert.equal(speech.instances[0].inputTrack, mic.track);
  assert.equal(voice.snapshot().diagnostics.microphone.mode, 'recognition');
  assert.equal(voice.snapshot().diagnostics.microphone.device, 'Test microphone');
  assert.match(d.querySelector('[data-voice-stage="input"]').textContent, /same track sent to recognition/);
  speech.instances[0].error('no-speech'); clock.tick(25); await flush();
  assert.equal(mic.calls.length, 1); assert.equal(speech.instances[1].inputTrack, mic.track);
  voice.stop(); assert.equal(mic.track.stops, 1); assert.equal(clock.pending, 0);
});

test("microphone diagnostic cancellation disposes a late stream and permission errors stay visible", async t => {
  const {w, d, voice} = setup(t);
  const pending = deferred(), mic = fakeMicrophone(w, {pending});
  d.querySelector('.voice-mic-test').click();
  voice.stop(); pending.resolve(mic.stream); await flush();
  assert.equal(mic.track.stops, 1); assert.equal(mic.contexts[0].closed, true);
  fakeMicrophone(w, {deny: true});
  d.querySelector('.voice-mic-test').click(); await flush();
  assert.match(d.querySelector('[data-voice-stage="input"]').textContent, /NotAllowedError/);
});

test("input tests expire and hand off from active recognition without resuming it", async t => {
  const h = setup(t), {w, d, voice, clock} = h;
  const mic = fakeMicrophone(w);
  d.querySelector('.voice-mic-test').click(); await flush(); clock.tick(15000);
  assert.equal(mic.track.stops, 1);
  assert.match(d.querySelector('[data-voice-stage="input"]').textContent, /complete/i);
  assert.equal(clock.pending, 0);
  const nextMic = fakeMicrophone(w);
  d.querySelector('.voice-mic-test').click(); await flush();
  await voice.start();
  assert.equal(nextMic.track.stops, 1); assert.equal(d.querySelector('.voice-mic-test').disabled, false);
  const probe = fakeMicrophone(w), rec = h.speech.instances.at(-1);
  d.querySelector('.voice-mic-test').click(); await flush();
  assert.equal(voice.snapshot().want, false); assert.equal(rec.aborts, 1);
  assert.equal(probe.calls.length, 1); assert.equal(rec.onresult, null);
  clock.tick(15000); assert.equal(h.speech.instances.length, 1);
  voice.stop(); assert.equal(d.querySelector('.voice-mic-test').disabled, false);
  const thirdMic = fakeMicrophone(w);
  d.querySelector('.voice-mic-test').click(); await flush();
  h.slide({id: 'next', page: 2}); voice.contextChanged();
  assert.equal(thirdMic.track.stops, 1); assert.equal(clock.pending, 0);
});

test("device picker routes the chosen USB track to local recognition and meters the same stream", async t => {
  const {w, d, voice, speech, clock} = setup(t);
  const probe = fakeMicrophone(w);
  d.querySelector('.voice-mic-devices').click(); await flush();
  const select = d.querySelector('.voice-mic-device');
  assert.deepEqual([...select.options].map(o => o.textContent),
    ['Chrome default microphone', 'MacBook Pro Microphone', 'USB Type-C Microphone']);
  select.value = 'usb'; select.dispatchEvent(new w.Event('change'));
  assert.equal(probe.track.stops, 1);
  const selected = fakeMicrophone(w); selected.setAmplitude(18);
  await voice.start(); await flush();
  assert.deepEqual(plain(selected.calls), [{audio: {deviceId: {exact: 'usb'}}, video: false}]);
  assert.equal(speech.instances.at(-1).inputTrack, selected.track);
  assert.equal(speech.instances.at(-1).processLocally, true);
  assert.match(d.querySelector('[data-voice-stage="input"]').textContent, /signal detected/i);
  const report = voice.snapshot().diagnostics;
  assert.equal(report.microphone.mode, 'recognition');
  assert.equal(report.microphone.track.enabled, true);
  assert.equal(report.microphone.track.sampleRate, 48000);
  assert.equal(report.microphone.track.deviceId, undefined);
  speech.instances.at(-1).error('aborted'); clock.tick(25); await flush();
  assert.equal(selected.calls.length, 1, 'automatic restart keeps the selected input open');
  assert.equal(speech.instances.at(-1).inputTrack, selected.track);
  voice.stop(); assert.equal(selected.track.stops, 1); assert.equal(clock.pending, 0);
});

test("changing devices cancels a pending selected-device request and never falls back to another mic", async t => {
  const {w, d, voice, speech} = setup(t);
  fakeMicrophone(w); d.querySelector('.voice-mic-devices').click(); await flush();
  const select = d.querySelector('.voice-mic-device');
  select.value = 'usb'; select.dispatchEvent(new w.Event('change'));
  const pending = deferred(), mic = fakeMicrophone(w, {pending});
  const starting = voice.start(); await flush();
  select.value = 'builtin'; select.dispatchEvent(new w.Event('change'));
  pending.resolve(mic.stream); await starting; await flush();
  assert.equal(mic.track.stops, 1); assert.equal(voice.snapshot().want, false);
  assert.equal(speech.instances.at(-1).starts, 0);
  fakeMicrophone(w, {deny: true}); await voice.start(); await flush();
  assert.equal(speech.instances.at(-1).starts, 0);
  assert.equal(voice.snapshot().state, 'error');
});

test("selected-track startup failure stops input instead of retrying with the default microphone", async t => {
  const {w, d, voice, speech, clock} = setup(t, {speech: {start(rec) {
    if (rec.inputTrack) throw Object.assign(Error('Audio-track start unavailable'), {name: 'NotSupportedError'});
  }}});
  fakeMicrophone(w); d.querySelector('.voice-mic-devices').click(); await flush();
  const select = d.querySelector('.voice-mic-device');
  select.value = 'usb'; select.dispatchEvent(new w.Event('change'));
  const mic = fakeMicrophone(w); await voice.start();
  assert.equal(voice.snapshot().state, 'error'); assert.equal(voice.snapshot().want, false);
  assert.match(voice.snapshot().reason, /NotSupportedError/);
  assert.equal(mic.track.stops, 1); clock.tick(20000);
  assert.equal(speech.instances.length, 1); assert.equal(clock.pending, 0);
});

test("diagnostics show local API failures, absent targets, interim duplicates and artwork success", async t => {
  const h = setup(t, {speech: {local: false}}), {voice, d, w} = h;
  await voice.start();
  assert.match(d.querySelector('[data-voice-stage="environment"]').textContent, /API unavailable/);
  assert.equal(voice.snapshot().diagnostics.recognition.state, 'error');
  voice.dispatch('table');
  d.querySelector('.voice-pop-artwork').dispatchEvent(new w.Event('load'));
  assert.match(d.querySelector('[data-voice-stage="artwork"]').textContent, /1\/1.*loaded/);
  h.slide({id: 'empty', page: 2, semanticRegions: []}); voice.slideChanged(); voice.dispatch('table');
  assert.match(d.querySelector('[data-voice-stage="target"]').textContent, /0 matches/);
  assert.match(d.querySelector('[data-voice-stage="action"]').textContent, /none on slide/);
  const live = setup(t); await live.voice.start(); live.clock.tick(60);
  live.speech.instances[0].result('this table'); live.speech.instances[0].result('this table');
  assert.match(live.d.querySelector('[data-voice-stage="action"]').textContent, /duplicate interim/i);
});

test("unsupported local API, unavailable pack, denied checks and installation failures never start recognition", async t => {
  for (const speechOptions of [{local: false}, {available: () => "unavailable"}, {available: () => {throw Error("policy denied");}},
    {available: () => "downloadable", install: () => false}, {available: () => "downloading", install: () => {throw Error("offline");}}]) {
    await t.test(JSON.stringify(speechOptions), async sub => {
      const {voice, speech} = setup(sub, {speech: speechOptions});
      assert.equal(await voice.start(), false); assert.equal(speech.instances.length, 0);
      assert.equal(voice.snapshot().state, "error"); assert.equal(voice.snapshot().want, false);
      assert.equal(voice.dispatch("table"), "shown");
    });
  }
});

test("downloadable packs install from Start, then availability is verified again", async t => {
  const {voice, speech} = setup(t, {speech: {available: count => count === 1 ? "downloadable" : "available"}});
  assert.equal(await voice.start(), true);
  assert.equal(speech.checks.length, 2); assert.deepEqual(speech.installs, [{langs: ["en-US"], processLocally: true}]);
  assert.equal(speech.instances.length, 1);
});

test("missing local preparation methods and incomplete installation fail closed", async t => {
  for (const mode of ["available missing", "install missing", "pack still unavailable"]) {
    await t.test(mode, async sub => {
      const {voice, speech} = setup(sub, {speech: {available: () => "downloadable"}});
      if (mode === "available missing") speech.SR.available = undefined;
      if (mode === "install missing") speech.SR.install = undefined;
      assert.equal(await voice.start(), false);
      assert.equal(speech.instances.length, 0); assert.equal(voice.snapshot().state, "error");
    });
  }
});

test("phrase constructor or setter incompatibility keeps local recognition working without bias", async t => {
  const {w, voice, speech} = setup(t);
  w.SpeechRecognitionPhrase = class {constructor() {throw Error("unsupported");}};
  assert.equal(await voice.start(), true);
  assert.equal(speech.instances[0].processLocally, true); assert.equal(speech.instances[0].starts, 1);
  assert.equal(voice.snapshot().state, "listening");
});

test("cancellation during availability and installation prevents delayed microphone starts", async t => {
  for (const step of ["available", "install"]) {
    await t.test(step, async sub => {
      const pending = deferred();
      const {voice, speech} = setup(sub, {speech: step === "available" ? {available: () => pending.promise}
        : {available: () => "downloadable", install: () => pending.promise}});
      const started = voice.start(); await flush(); assert.equal(voice.snapshot().state, "preparing");
      voice.toggleMute(); pending.resolve(step === "available" ? "available" : true);
      assert.equal(await started, false); assert.equal(speech.instances.length, 0);
      assert.equal(voice.snapshot().state, "muted");
    });
  }
});

test("preparation cancelled by context, slide navigation, stop, or destroy stays cancelled", async t => {
  for (const cancel of [h => h.active(false), h => { h.slide({id: "s2", page: 2}); h.voice.slideChanged(); }, h => h.voice.stop(), h => h.voice.destroy()]) {
    await t.test(cancel.toString(), async sub => {
      const pending = deferred(), h = setup(sub, {speech: {available: () => pending.promise}});
      const started = h.voice.start(); cancel(h); pending.resolve("available");
      assert.equal(await started, false); assert.equal(h.speech.instances.length, 0);
    });
  }
});

test("local-mode setter failure fails closed before start", async t => {
  const {voice, speech, clock} = setup(t, {speech: {readonlyLocal: true}});
  await voice.start(); assert.equal(speech.instances[0].starts, 0);
  assert.equal(voice.snapshot().state, "error"); assert.equal(clock.pending, 0);
});

test("terminal microphone errors stop retries and leave manual controls working", async t => {
  for (const error of ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]) {
    await t.test(error, async sub => {
      const {voice, speech, clock} = setup(sub); await voice.start(); speech.instances[0].error(error);
      assert.equal(voice.snapshot().state, "error"); assert.equal(voice.snapshot().reason, error);
      assert.equal(voice.snapshot().want, false); clock.tick(10000); assert.equal(speech.instances.length, 1);
      assert.equal(voice.dispatch("table"), "shown");
    });
  }
});

test("phrase-bias failure restarts a new local session without phrases", async t => {
  const {voice, speech, clock} = setup(t); await voice.start();
  assert.ok(speech.instances[0].phrases.length);
  assert.ok(speech.instances[0].phrases.some(phrase => phrase.phrase === "diagram mode"));
  assert.ok(speech.instances[0].phrases.some(phrase => phrase.phrase === "default mode"));
  speech.instances[0].error("phrases-not-supported"); clock.tick(25);
  assert.equal(speech.instances.length, 2); assert.equal(speech.instances[1].phrases, undefined);
  assert.equal(speech.instances[1].processLocally, true); assert.equal(voice.snapshot().state, "listening");
});

test("repeated browser aborts without results stop retries and retain per-session evidence", async t => {
  const {voice, speech, clock, d} = setup(t, {config: {watchdogMs: 90000}});
  await voice.start();
  for (let i = 0; i < 3; i++) {
    speech.instances.at(-1).onaudiostart(); clock.tick(6000);
    speech.instances.at(-1).onaudioend(); speech.instances.at(-1).error('aborted');
    if (i < 2) clock.tick(i === 0 ? 25 : 50);
  }
  assert.equal(voice.snapshot().state, 'error'); assert.equal(voice.snapshot().want, false);
  assert.match(voice.snapshot().reason, /aborted.*3.*Test microphone/i);
  clock.tick(20000); assert.equal(speech.instances.length, 3); assert.equal(clock.pending, 0);
  assert.equal(d.querySelector('.voice-mic-test').disabled, false);
  const sessions = plain(voice.snapshot().diagnostics.recognition.recentSessions);
  assert.equal(sessions.length, 3);
  assert.ok(sessions.every(s => s.durationMs === 6000 && s.results === 0 && s.error === 'aborted'));
  await voice.start(); assert.equal(voice.snapshot().state, 'listening');
  speech.instances.at(-1).result('no trigger'); speech.instances.at(-1).error('aborted');
  assert.equal(voice.snapshot().state, 'restarting', 'a result resets consecutive abort failures');
});

test("restart backoff uses fresh instances, resets on result and watchdog recovers without onend", async t => {
  const {voice, speech, clock} = setup(t); await voice.start();
  speech.instances[0].end(); clock.tick(24); assert.equal(speech.instances.length, 1); clock.tick(1);
  speech.instances[1].end(); clock.tick(49); assert.equal(speech.instances.length, 2); clock.tick(1);
  speech.instances[2].result("nothing to trigger"); assert.equal(voice.snapshot().failures, 0);
  speech.instances[2].end(); clock.tick(25); assert.equal(speech.instances.length, 4);
  clock.tick(1000); assert.equal(voice.snapshot().state, "restarting");
  assert.equal(speech.instances[3].aborts, 1); clock.tick(50); assert.equal(speech.instances.length, 5);
  voice.stop(); assert.equal(clock.pending, 0);
});

test("stop falls back to stop when abort throws and destroys all runtime timers", async t => {
  const {voice, speech, clock, d} = setup(t, {speech: {abortThrows: true}}); await voice.start();
  voice.dispatch("table"); voice.togglePanel(); voice.destroy();
  assert.equal(speech.instances[0].aborts, 1); assert.equal(speech.instances[0].stops, 1);
  assert.equal(clock.pending, 0); assert.equal(d.querySelector(".pigeon-voice-panel"), null);
  assert.equal(d.querySelector(".pigeon-voice-overlay"), null);
});

test("delayed callbacks from prior slides, muted sessions and inactive contexts cannot act", async t => {
  const h = setup(t), {voice, speech, clock} = h; await voice.start(); clock.tick(60);
  const old = speech.instances[0], delayedResult = old.onresult, delayedError = old.onerror, delayedEnd = old.onend;
  h.slide({id: "s2", page: 2, semanticRegions: [region("new-table")]}); voice.slideChanged(); await flush(); clock.tick(100);
  delayedResult({resultIndex: 0, results: [{0: {transcript: "this table"}}]}); delayedError({error: "not-allowed"}); delayedEnd();
  assert.equal(voice.snapshot().open, null); assert.equal(voice.snapshot().state, "listening");
  const currentResult = speech.instances[1].onresult; voice.toggleMute();
  currentResult({resultIndex: 0, results: [{0: {transcript: "this table"}}]}); assert.equal(voice.snapshot().open, null);
  voice.toggleMute(); h.active(false); assert.equal(voice.snapshot().state, "paused");
  assert.equal(voice.dispatch("table"), "inactive"); h.active(true); await flush(); assert.equal(voice.snapshot().state, "listening");
});

test("stale interval, voice cooldown and dismissal suppression apply only to voice", async t => {
  const {voice, speech, clock} = setup(t); await voice.start();
  assert.equal(voice.dispatch("table", "voice"), "suppressed"); clock.tick(60);
  speech.instances[0].result("this table"); assert.equal(voice.snapshot().open.ruleId, "table");
  assert.equal(voice.dispatch("table", "voice"), "suppressed"); clock.tick(300);
  assert.equal(voice.dispatch("table", "voice"), "pulse");
  assert.equal(voice.dispatch("table"), "dismissed"); assert.equal(voice.snapshot().open, null);
  clock.tick(300); assert.equal(voice.dispatch("table", "voice"), "suppressed");
  assert.equal(voice.dispatch("table"), "shown"); voice.dismiss();
  clock.tick(1000); assert.equal(voice.dispatch("table", "voice"), "shown");
});

test("same-slide tier changes reject callbacks from the previous visible state", async t => {
  const h = setup(t), {voice, speech, clock} = h;
  h.slide({presentationContext: 1, semanticTiers: {}}); voice.slideChanged();
  await voice.start(); clock.tick(60);
  const delayed = speech.instances.at(-1).onresult;
  h.slide({presentationContext: 2, semanticRegions: []}); voice.slideChanged();
  await flush(); clock.tick(100);
  delayed({resultIndex: 0, results: [{0: {transcript: "this table"}}]});
  assert.equal(voice.snapshot().open, null);
  assert.equal(voice.snapshot().diagnostics.lastResult, null);
  assert.equal(voice.dispatch("table"), "none");
  assert.equal(voice.snapshot().events[0].outcome, "none visible on slide/tier");
});

test("0/1/many resolution stays on current slide and choices are sorted by y then x", t => {
  const h = setup(t, {regions: []}), {voice, d} = h;
  assert.equal(voice.dispatch("table"), "none"); assert.equal(voice.snapshot().events[0].outcome, "none on slide");
  h.slide({semanticRegions: [region("bottom", "_table", 10, 300), region("right", "_table", 300, 10), region("left", "_table", 20, 10), region("other", "_fig")]});
  assert.equal(voice.dispatch("table"), "choices"); assert.deepEqual(plain(voice.snapshot().choices), ["left", "right", "bottom"]);
  assert.equal(d.querySelectorAll(".voice-choice").length, 3); assert.equal(voice.snapshot().open, null);
  assert.equal(voice.key(new h.w.KeyboardEvent("keydown", {key: "2"})), true);
  assert.deepEqual(plain(voice.snapshot().open.regionIds), ["right"]);
  assert.equal(voice.dispatch("table"), "dismissed", "same manual rule closes selected choice");
  assert.equal(voice.snapshot().open, null);
  voice.dispatch("figure"); assert.deepEqual(plain(voice.snapshot().open.regionIds), ["other"]);
  h.slide({semanticRegions: Array.from({length: 10}, (_, i) => region(`table-${i + 1}`, "_table", 10, i * 20))});
  voice.dispatch("table");
  assert.equal(d.querySelectorAll(".voice-choice").length, 10, "later matches remain selectable by mouse");
  d.querySelectorAll(".voice-choice")[9].click();
  assert.deepEqual(plain(voice.snapshot().open.regionIds), ["table-10"]);
});

test("stacked crops share a scale constrained by widest width and summed heights", t => {
  const {w, voice, d} = setup(t, {regions: [region("a", "takeaway", 0, 0, 600, 80), region("b", "takeaway", 200, 200, 300, 80)]});
  assert.equal(voice.dispatch("takeaway"), "shown");
  const cards = [...d.querySelectorAll(".voice-pop-card")], images = [...d.querySelectorAll(".voice-pop-artwork")];
  assert.equal(cards.length, 2); assert.equal(images[0].style.width, images[1].style.width);
  assert.equal(images[0].getAttribute("src"), "/deck/slide-1.svg");
  assert.equal(images[0].style.left, "0px", "crop padding clamps to page edge");
  const {cropBounds, stackScale} = w.PigeonVoice;
  assert.deepEqual(plain(cropBounds(region("x", "_fig", 950, 530, 10, 10), {width: 960, height: 540}, 6)), {x: 944, y: 524, width: 16, height: 16});
  assert.equal(stackScale([{width: 600, height: 20}, {width: 300, height: 20}], 1000, 1000, {popMaxFraction: .8, popMaxScale: 4}, 1), 800 / 600);
});

test("custom actions use distinct overlay modes; focus masks only conservative text targets", async t => {
  const customRules = [
    {id: "table", target: "_table", phrases: ["table"], action: "focus", multi: "stack"},
    {id: "takeaway", target: "takeaway", phrases: ["takeaway"], action: "focus", multi: "stack"},
    {id: "figure", target: "_fig", phrases: ["figure"], action: "spotlight", multi: "stack"},
  ];
  const {w, voice, d} = setup(t, {config: {rules: customRules}, regions: [region("t"), region("k", "takeaway"), region("f", "_fig")]});
  let maskCalls = 0; w.PigeonWandEffects = {textArtwork: async () => { maskCalls++; return "data:image/png;base64,bWFzaw=="; }};
  voice.dispatch("table"); await flush(); assert.equal(maskCalls, 0);
  assert.ok(d.querySelector(".voice-emphasis-focus")); assert.equal(d.querySelector(".voice-pop-card").dataset.rendering, "original");
  voice.dispatch("takeaway"); await flush(); assert.equal(maskCalls, 1);
  assert.equal(d.querySelector(".voice-pop-card").dataset.rendering, "text-mask");
  voice.dispatch("figure"); assert.ok(d.querySelector(".voice-emphasis-spotlight"));
});

test("Escape API, backdrop, navigation, manual repeat and optional timer dismiss overlays", t => {
  const h = setup(t, {config: {autoCloseMs: 200}}), {voice, clock, d} = h;
  voice.togglePanel(); voice.dispatch("table"); assert.equal(voice.dismiss(), true);
  assert.equal(voice.snapshot().panelOpen, true); assert.equal(voice.dismiss(), true); assert.equal(voice.dismiss(), false);
  voice.dispatch("table"); d.querySelector(".voice-pop-backdrop").click(); assert.equal(voice.snapshot().open, null);
  voice.dispatch("table"); clock.tick(200); assert.equal(voice.snapshot().open, null);
  voice.dispatch("table"); h.slide({id: "s2", page: 2}); voice.slideChanged(); assert.equal(voice.snapshot().open, null);
});

test("keyboard fallbacks preserve bare M/D and ignore typing/repeat/modifier shortcuts", t => {
  const {w, voice, d} = setup(t), key = (value, opts = {}) => voice.key(new w.KeyboardEvent("keydown", {key: value, ...opts}));
  assert.equal(key("m"), false); assert.equal(key("d"), false);
  assert.equal(key("T", {shiftKey: true}), true); assert.equal(voice.snapshot().open.ruleId, "table");
  assert.equal(key("T", {shiftKey: true}), true); assert.equal(voice.snapshot().open, null);
  assert.equal(key("M", {shiftKey: true}), true); assert.equal(voice.snapshot().muted, true);
  assert.equal(key("D", {shiftKey: true}), true); assert.ok(d.querySelector(".voice-debug-box"));
  assert.equal(voice.dismiss(), true); assert.equal(d.querySelector(".voice-debug-box"), null);
  assert.equal(voice.snapshot().debug, false);
  assert.equal(key("T", {shiftKey: true, ctrlKey: true}), false); assert.equal(key("T", {shiftKey: true, repeat: true}), false);
  const input = d.createElement("input");
  assert.equal(voice.key({key: "T", shiftKey: true, target: input}), false);
});

test("media capture pauses recognition and resumes only when user still wants it", async t => {
  const h = setup(t), {w, d, voice, speech, clock} = h; await voice.start(); clock.tick(60);
  const media = d.createElement("video"); d.body.append(media);
  let paused = false; Object.defineProperty(media, "paused", {get: () => paused});
  media.dispatchEvent(new w.Event("play")); assert.equal(voice.snapshot().state, "paused");
  assert.equal(voice.dispatch("table"), "inactive");
  paused = true; media.dispatchEvent(new w.Event("pause")); await flush(); assert.equal(voice.snapshot().state, "listening");
  assert.equal(speech.instances.length, 2);
  paused = false; media.dispatchEvent(new w.Event("play")); voice.toggleMute();
  paused = true; media.dispatchEvent(new w.Event("ended")); assert.equal(speech.instances.length, 2);
  assert.equal(voice.snapshot().muted, true);
  voice.toggleMute(); paused = false; media.dispatchEvent(new w.Event("play")); voice.stop();
  paused = true; media.dispatchEvent(new w.Event("pause")); assert.equal(voice.snapshot().want, false);
  assert.equal(voice.snapshot().state, "off");
});

test("last words, trigger highlighting and ten events remain ephemeral; reduced motion skips animations", async t => {
  const {voice, speech, clock, d, animations, w} = setup(t, {reducedMotion: true}); await voice.start(); clock.tick(60);
  speech.instances[0].result("one two three four five six seven eight nine ten this table");
  assert.equal(voice.snapshot().lastWords.split(" ").length, 10); assert.equal(d.querySelector("mark").textContent, "this table");
  assert.equal(animations.length, 0);
  for (let n = 0; n < 15; n++) voice.dispatch("figure");
  assert.equal(voice.snapshot().events.length, 10); assert.equal(d.querySelectorAll(".voice-log li").length, 10);
  assert.equal(w.localStorage.length, 0); assert.equal(w.sessionStorage.length, 0);
  assert.ok(voice.snapshot().events.every(event => !("transcript" in event)));
  voice.destroy(); assert.equal(voice.snapshot().lastWords, ""); assert.equal(voice.snapshot().events.length, 0);
});
