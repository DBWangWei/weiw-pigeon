/* Loopback-only speech adapter. Short PCM buffers and replies live in memory.
 * The SpeechRecognition-shaped boundary preserves Pigeon's trigger pipeline. */
(() => {
  'use strict';
  let capability = null;
  const RATE = 16000, FRAME = 320;
  const workletUrl = new URL('voice-capture-worklet.js', document.currentScript?.src || new URL('src/voice-local.js', location.href)).href;
  function createSegmenter({onSegment, onSpeechStart = () => {}, onSpeechEnd = () => {}}) {
    let lead = [], chunks = [], pending = [], speaking = false, voiced = 0, quiet = 0, length = 0;
    function frame(data) {
      const loud = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length) > .012;
      if (!speaking) {
        lead.push(data); if (lead.length > 13) lead.shift();
        if (!loud) return;
        speaking = true; chunks = lead; lead = []; length = chunks.length * FRAME;
        voiced = FRAME; quiet = 0; onSpeechStart();
      } else {
        chunks.push(data); length += FRAME;
        if (loud) { voiced += FRAME; quiet = 0; } else quiet += FRAME;
      }
      if (quiet >= RATE * .7 || length >= RATE * 8) {
        const speech = chunks; const count = length;
        chunks = []; speaking = false; length = 0;
        onSpeechEnd();
        if (voiced >= RATE * .24) {
          const audio = new Float32Array(count);
          speech.forEach((part, index) => audio.set(part, index * FRAME));
          onSegment(audio);
        }
        voiced = quiet = 0;
      }
    }
    return {push(data) {
      // Worklet messages are 20 ms; accepting arbitrary lengths also makes the
      // frame boundaries independent of the browser's render quantum.
      for (const value of data) {
        pending.push(value);
        if (pending.length === FRAME) { frame(new Float32Array(pending)); pending = []; }
      }
    }};
  }
  class Recognition {
    static backend = 'whisper';
    static get capability() { return capability; }
    get processLocally() { return true; }
    set processLocally(value) { if (value !== true) throw Error('Local processing is required'); }
    static async available({langs}) {
      if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.protocol !== 'http:')
        throw Error('Local Whisper needs Pigeon’s server. Run python3 scripts/serve.py and open its localhost URL.');
      const response = await fetch('/api/voice/status', {cache:'no-store', signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw Error('Pigeon speech server unavailable. Start python3 scripts/serve.py.');
      capability = await response.json();
      if (!capability.available) throw Error(capability.detail || 'Local speech engine unavailable');
      if (capability.language !== langs[0].split('-')[0].toLowerCase()) throw Error('Local speech model language differs from voice.lang. Restart the server with the correct model.');
      return 'available';
    }
    constructor() {
      this.processLocally = true; this.epoch = 0; this.results = []; this.queue = []; this.busy = false;
    }
    emit(name, event = {}) { this[`on${name}`]?.(event); }
    pipeline(detail) { this.emit('pipeline', {detail}); }
    start(track) {
      const token = ++this.epoch;
      this.controller = new AbortController();
      this.capture(track, token).catch(error => { if (token === this.epoch) this.fail(error); });
    }
    async capture(track, token) {
      if (!capability?.available) throw Error('Local speech engine was not prepared');
      if (track?.kind !== 'audio' || track.readyState !== 'live') throw Error('No live selected microphone track');
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context || !window.AudioWorkletNode) throw Error('Chrome AudioWorklet capture is unavailable');
      const context = new Context(); this.context = context;
      await context.resume();
      await context.audioWorklet.addModule(workletUrl);
      if (token !== this.epoch) return;
      this.source = context.createMediaStreamSource(new MediaStream([track]));
      this.node = new AudioWorkletNode(context, 'pigeon-voice-capture', {numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      const gate = createSegmenter({
        onSpeechStart: () => { this.emit('soundstart'); this.emit('speechstart'); this.pipeline('Speech detected; collecting utterance. Pause briefly to transcribe.'); },
        onSpeechEnd: () => { this.emit('speechend'); this.emit('soundend'); },
        onSegment: samples => {
          if (this.queue.length >= 2) { this.pipeline('Transcription is falling behind; oldest queued audio discarded.'); this.queue.shift(); }
          this.queue.push(samples); this.drain(token);
        },
      });
      this.node.port.onmessage = event => { if (token === this.epoch) gate.push(event.data); };
      this.source.connect(this.node); this.node.connect(context.destination);
      this.emit('start'); this.emit('audiostart');
      this.pipeline(`Local Whisper · ${capability.model} · listening on selected microphone`);
    }
    async drain(token) {
      if (this.busy || token !== this.epoch) return;
      this.busy = true;
      try {
        while (this.queue.length && token === this.epoch) {
          const samples = this.queue.shift(), pcm = new ArrayBuffer(samples.length * 2), view = new DataView(pcm);
          samples.forEach((value, index) => view.setInt16(index * 2, Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)), true));
          this.pipeline(`Transcribing ${(samples.length / RATE).toFixed(1)} s locally · ${capability.model}`);
          let response;
          // A cancelled prior slide may still be finishing native inference.
          for (let attempt=0; attempt<60; attempt++) {
            response = await fetch('/api/voice/transcribe', {method:'POST', headers:{'Content-Type':'application/octet-stream',
              'X-Pigeon-Voice-Token':capability.token}, body:pcm, signal:this.controller.signal});
            if (response.status !== 429) break;
            await new Promise(resolve => { this.retryTimer=setTimeout(resolve,500); this.retryResolve=resolve; });
            if (token !== this.epoch) return;
          }
          const result = await response.json();
          if (token !== this.epoch) return;
          if (!response.ok) throw Error(result.error || 'Local transcription request failed');
          if (typeof result.text !== 'string') throw Error('Invalid transcription response');
          this.pipeline(`Local decode finished in ${result.durationMs ?? '?'} ms${result.text.trim() ? '' : '; no words decoded'}`);
          if (result.text.trim()) {
            const index = this.results.length;
            const words = [{transcript:result.text}]; words.isFinal = true;
            this.results.push(words); this.emit('result', {resultIndex:index, results:[...this.results]});
            // Keep only result positions for occurrence tracking, not transcripts.
            this.results[index] = null;
          } else this.emit('nomatch');
        }
      } catch (error) { if (token === this.epoch) this.fail(error); }
      finally { this.busy = false; }
    }
    fail(error) {
      this.emit('error', {error:'local-transcription-failed', message:error?.message || String(error)});
      this.abort();
    }
    abort() {
      this.epoch++; this.controller?.abort();
      clearTimeout(this.retryTimer); this.retryResolve?.(); this.retryResolve = null;
      this.queue = []; this.results = [];
      if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); }
      this.source?.disconnect(); this.context?.close().catch(() => {});
      this.node = this.source = this.context = null;
    }
    stop() { this.abort(); this.emit('end'); }
  }
  window.PigeonLocalSpeech = {Recognition, createSegmenter};
})();
