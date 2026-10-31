/* Visible, transient voice pipeline diagnostics. The optional input test uses
 * an analyser only: no recording, playback, upload or persistent storage. */
(() => {
  "use strict";
  function create({panel, config, getSlide, describeContext, onTestPhrase, onStopRecognition}) {
    const d = panel.ownerDocument;
    const rows = new Map(), history = [];
    const environment = {protocol: window.location.protocol, host: window.location.hostname,
      secureContext: window.isSecureContext ?? null, language: config.lang,
      browser: window.navigator.userAgent, backend: config.backend, api: "Not checked", localSupport: null};
    const recognition = {state: config.enabled ? "off" : "disabled", detail: config.enabled ? "Not started" : "Disabled by config; manual and typed tests available", sessions: 0, results: 0, interim: 0, final: 0,
      audio: "Not reported", speech: "Not reported", lastEvent: "None", lastError: "", recentSessions: []};
    let pack = "Not checked", lastResult = null, lastTest = "", lastResolution = null, destroyed = false;
    let micToken = 0, micStream = null, micContext = null, micSource = null, micTimer = null, micTesting = false;
    let inputMode = null, selectedDevice = "", devices = [];
    let mic = {state: "idle", detail: "Not measured. Click Test microphone, then speak.", level: 0, peakDb: null, device: ""};
    const stages = {};
    const el = (tag, cls, text) => {
      const node = d.createElement(tag); if (cls) node.className = cls;
      if (text != null) node.textContent = text; return node;
    };
    const button = (text, cls, callback) => {
      const node = el("button", cls, text); node.type = "button"; node.addEventListener("click", callback); return node;
    };
    const section = el("section", "voice-diagnostics"); section.setAttribute("aria-label", "Voice diagnostics");
    section.append(el("h3", "", "Voice diagnostics"),
      el("p", "voice-diagnostic-help", "Check the stages below to see where voice stops working."));
    const list = el("dl", "voice-pipeline");
    for (const [id, label] of [["environment", "Recognition backend & language"], ["input", "1. Microphone input"],
      ["recognition", "2. Recognition"], ["text", "Recognized text"], ["match", "3. Phrase match"],
      ["target", "4. Target on current slide"], ["action", "5. Action"], ["artwork", "Artwork"]]) {
      const value = el("dd", "voice-stage"); value.dataset.voiceStage = id;
      rows.set(id, value); list.append(el("dt", "", label), value);
    }
    const meter = el("meter", "voice-input-meter"); meter.min = 0; meter.max = 100; meter.value = 0;
    meter.setAttribute("aria-label", "Microphone input level");
    const micButton = button("Test microphone", "voice-mic-test", () => micTesting ? stopMicTest() : startMicTest());
    const deviceLabel = el("label", "voice-mic-label", "Microphone device");
    const deviceSelect = el("select", "voice-mic-device"); deviceSelect.setAttribute("aria-label", "Microphone device");
    deviceSelect.append(newOption("", "Chrome default microphone")); deviceLabel.append(deviceSelect);
    const deviceButton = button("Find microphones", "voice-mic-devices", () => startMicTest());
    deviceSelect.addEventListener("change", () => {
      onStopRecognition?.(); stopMicTest(); selectedDevice = deviceSelect.value;
      mic = {state: "idle", detail: `Selected ${deviceSelect.selectedOptions[0]?.textContent || "microphone"}. Click Test microphone or Start microphone.`, level: 0, peakDb: null, device: ""};
      trace("input selection", deviceSelect.selectedOptions[0]?.textContent || "Chrome default microphone"); refresh();
    });
    const micHelp = el("p", "voice-diagnostic-help", "Find microphones enables device names and tests the input for 15 seconds. Choose your USB mic, then Test or Start. Testing stops recognition; Start resumes it. Recognition always uses the same captured stream as the live meter, including for Chrome default microphone.");
    const micControls = el("div", "voice-mic-controls"); micControls.append(micButton, meter);
    const form = el("form", "voice-test-form"), label = el("label", "", "Test a phrase without the microphone");
    const input = el("input", "voice-test-input"); input.type = "text"; input.value = config.rules[0]?.phrases[0] || "this table";
    input.maxLength = 1000; input.autocomplete = "off"; label.append(input);
    const testButton = el("button", "voice-test-submit", "Test phrase"); testButton.type = "submit";
    form.append(label, testButton);
    form.addEventListener("submit", event => {
      event.preventDefault(); if (destroyed) return;
      lastTest = input.value.slice(-1000); onTestPhrase(lastTest);
    });
    const timeline = el("details", "voice-diagnostic-events"), traceList = el("ol", "voice-diagnostic-trace");
    timeline.append(el("summary", "", "Recent diagnostic events"), traceList);
    const report = el("textarea", "voice-report"); report.hidden = true; report.readOnly = true; report.rows = 12;
    report.setAttribute("aria-label", "Voice diagnostic report to share");
    const reportButton = button("Copy diagnostic report", "voice-report-button", async () => {
      report.value = JSON.stringify(snapshot(), null, 2); report.hidden = false;
      report.focus(); report.select();
      try {
        if (!window.navigator.clipboard?.writeText) throw Error("Clipboard unavailable");
        await window.navigator.clipboard.writeText(report.value);
        if (!destroyed) reportButton.textContent = "Copied diagnostic report";
      } catch (_) { if (!destroyed) reportButton.textContent = "Select and copy the report below"; }
    });
    section.append(list, deviceLabel, deviceButton, micControls, micHelp, form, timeline, reportButton, report);
    panel.insertBefore(section, panel.querySelector(".voice-manual"));
    function newOption(value, label) {
      const option = el("option", "", label); option.value = value; return option;
    }
    function stage(id, text, level = "info") {
      if (destroyed) return;
      stages[id] = {text, level}; rows.get(id).textContent = text; rows.get(id).dataset.level = level;
    }
    function trace(name, detail, level = "info") {
      if (destroyed) return;
      history.unshift({time: Date.now(), stage: name, detail: String(detail).slice(0, 400), level});
      history.splice(30); traceList.replaceChildren();
      history.forEach(item => traceList.append(el("li", "", `${new Date(item.time).toLocaleTimeString()} · ${item.stage}: ${item.detail}`)));
    }
    function refresh() {
      if (destroyed) return;
      const local = environment.localSupport === null ? "local recognition not checked" :
        environment.localSupport ? "on-device recognition API available" : "on-device recognition API unavailable";
      stage("environment", `${environment.protocol} · ${environment.secureContext === false ? "insecure context" : environment.secureContext ? "secure context" : "secure context not reported"} · ${environment.api} · ${local} · ${config.lang} ${config.backend === "whisper" ? "model" : "pack"}: ${pack}`,
        environment.localSupport === false ? "error" : "info");
      stage("input", mic.detail, mic.state === "error" ? "error" : mic.level > 0 ? "ok" : "info");
      meter.value = mic.level;
      micButton.textContent = micTesting ? "Stop input test" : "Test microphone";
      micButton.disabled = deviceButton.disabled = deviceSelect.disabled = !config.enabled;
      stage("recognition", `${recognition.state}: ${recognition.detail} · audio: ${recognition.audio} · speech: ${recognition.speech} · ${recognition.results} results (${recognition.interim} interim, ${recognition.final} final) · last event: ${recognition.lastEvent}`,
        recognition.state === "error" ? "error" : recognition.state === "listening" && recognition.results ? "ok" : "info");
      if (!lastResult) stage("text", "No recognition result received yet.");
      const slide = getSlide(), counts = new Map();
      (slide?.semanticRegions || []).forEach(region => counts.set(region.target, (counts.get(region.target) || 0) + 1));
      const context = describeContext();
      const inventory = [...counts].map(([target, count]) => `${count} ${target}`).join(", ") || "no marked targets";
      stage("target", `Page ${slide?.page ?? "?"} (${slide?.id ?? "?"}): ${lastResolution ?
        `${lastResolution.ids.length} matches for ${lastResolution.target}${lastResolution.ids.length ? `: ${lastResolution.ids.join(", ")}` : ""}` : inventory}. ${context}`,
        lastResolution?.ids.length ? "ok" : "info");
    }
    function support(api) {
      environment.api = api?.backend === "whisper" ? "Local Whisper" : api ? (api === window.SpeechRecognition ? "SpeechRecognition" : "webkitSpeechRecognition") : "None";
      environment.localSupport = Boolean(api && api.prototype && "processLocally" in api.prototype && typeof api.available === "function");
      trace("browser", environment.localSupport ? "On-device API found" : "On-device API missing"); refresh();
    }
    function setPack(value) { pack = value; trace(config.backend === "whisper" ? "local engine" : "language pack", value); refresh(); }
    function status(value, detail) {
      recognition.state = value; recognition.detail = detail;
      trace("recognition", `${value}: ${detail}`, value === "error" ? "error" : "info"); refresh();
    }
    function event(name, detail = "") {
      recognition.lastEvent = name;
      if (name === "start requested") {
        recognition.sessions++; recognition.audio = "Waiting"; recognition.speech = "Waiting";
        recognition.recentSessions.unshift({startedAt: Date.now(), durationMs: 0, results: 0, sound: false, speech: false, error: ""});
        recognition.recentSessions.splice(5);
      }
      const session = recognition.recentSessions[0];
      if (session) {
        session.durationMs = Date.now() - session.startedAt;
        if (name === "soundstart") session.sound = true;
        if (name === "speechstart") session.speech = true;
        if (name === "error") session.error = detail;
      }
      if (name === "audiostart") recognition.audio = "Capture started";
      if (name === "audioend") recognition.audio = "Capture ended";
      if (name === "soundstart") recognition.audio = "Sound detected";
      if (name === "speechstart") recognition.speech = "Speech detected";
      if (name === "speechend") recognition.speech = "Speech ended";
      if (name === "error") recognition.lastError = detail;
      trace(name, detail || name, name === "error" ? "error" : "info"); refresh();
    }
    function heard({text, isFinal = false, confidence, matches, fresh, source = "voice"}) {
      const from = source === "voice" ? "Recognition" : "Typed test (bypasses microphone)";
      if (source === "voice") {
        recognition.results++; recognition[isFinal ? "final" : "interim"]++; recognition.lastEvent = "result";
        if (recognition.recentSessions[0]) recognition.recentSessions[0].results++;
        lastResult = {text: String(text).slice(-1000), isFinal, confidence: Number.isFinite(confidence) ? confidence : null};
        stage("text", `${isFinal ? "Final" : "Interim"}${lastResult.confidence === null ? "" : ` · confidence ${Math.round(lastResult.confidence * 100)}%`}: “${lastResult.text}”`, "ok");
      }
      const textMatch = matches.map(match => `“${match.phrase}” → ${match.ruleId}`).join("; ");
      stage("match", `${from}: ${matches.length ? textMatch : "No trigger phrase matched"}${matches.length && !fresh.length ? " (already handled in this interim result)" : ""}`, matches.length ? "ok" : "info");
      if (!matches.length) stage("action", `${from}: no action; no trigger phrase matched.`);
      else if (!fresh.length) stage("action", `${from}: duplicate interim match; no new action.`);
      trace("phrase match", `${from}: ${textMatch || "none"}${matches.length && !fresh.length ? " (duplicate)" : ""}`); refresh();
    }
    function outcome(rule, source, detail, regions = []) {
      const from = source === "voice" ? "Voice" : source === "typed" ? "Typed test" : "Manual button/key";
      lastResolution = {target: rule.target, ids: regions.map(r => r.id)};
      stage("action", `${from} · ${rule.id} → ${rule.command || rule.action}: ${detail}`, /failed|blocked|suppressed/i.test(detail) ? "warn" : "ok");
      trace("action", `${from} · ${rule.id}: ${detail}`);
      refresh();
    }
    function artwork(detail, level = "info") { stage("artwork", detail, level); trace("artwork", detail, level); }
    function slideChanged() {
      lastResult = null; lastResolution = null;
      stage("match", "Waiting for a phrase on this slide."); stage("action", "No action requested on this slide.");
      stage("artwork", "No emphasis crop requested.");
      trace("slide", `Page ${getSlide()?.page ?? "?"}`); refresh();
    }
    function stopMicTest(detail = "Input test stopped.") {
      micToken++; window.clearTimeout(micTimer); micTimer = null;
      if (!inputMode && !micStream && !micContext) return;
      micSource?.disconnect(); micSource = null;
      micStream?.getTracks().forEach(track => track.stop()); micStream = null;
      if (micContext) { try { Promise.resolve(micContext.close()).catch(() => {}); } catch (_) {} micContext = null; }
      micTesting = false; inputMode = null;
      mic = {...mic, state: "stopped", detail: `${detail}${mic.peakDb === null ? "" : ` Peak: ${Math.round(mic.peakDb)} dBFS (${mic.device}).`}`, level: 0, contextState: "closed"}; refresh();
    }
    async function startMicTest() {
      if (destroyed || !config.enabled) return;
      onStopRecognition?.();
      try { await startInput("test"); } catch (_) { /* The input stage shows the error. */ }
    }
    function trackInfo(track) {
      const settings = track?.getSettings?.() || {};
      return {enabled: track?.enabled, muted: track?.muted, readyState: track?.readyState,
        sampleRate: settings.sampleRate, channelCount: settings.channelCount,
        echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl};
    }
    async function refreshDevices(token) {
      try {
        const listed = await window.navigator.mediaDevices?.enumerateDevices?.();
        if (!listed || token !== micToken || destroyed) return;
        devices = listed.filter(device => device.kind === "audioinput" && device.deviceId)
          .map((device, i) => ({id: device.deviceId, label: device.label || `Microphone ${i + 1}`}));
        deviceSelect.replaceChildren(newOption("", "Chrome default microphone"), ...devices.map(device => newOption(device.id, device.label)));
        if (selectedDevice && !devices.some(device => device.id === selectedDevice)) deviceSelect.append(newOption(selectedDevice, "Selected microphone (not currently listed)"));
        deviceSelect.value = selectedDevice;
      } catch (error) { trace("input devices", error?.message || "Could not list microphones", "warn"); }
    }
    async function startInput(mode) {
      stopMicTest(); const token = micToken;
      inputMode = mode; micTesting = mode === "test";
      mic = {state: "requesting", mode, detail: "Requesting microphone permission…", level: 0, peakDb: null, device: ""}; refresh();
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!window.navigator.mediaDevices?.getUserMedia || (mode === "test" && !AudioContext)) throw Error("Microphone access unavailable here. Serve the deck on localhost in Chrome.");
        let context = null;
        if (AudioContext) {
          try { context = new AudioContext(); micContext = context; Promise.resolve(context.resume()).catch(() => {}); }
          catch (error) { if (mode === "test") throw error; }
        }
        const stream = await window.navigator.mediaDevices.getUserMedia({audio: selectedDevice ? {deviceId: {exact: selectedDevice}} : true, video: false});
        if (token !== micToken || destroyed) { stream.getTracks().forEach(track => track.stop()); return null; }
        micStream = stream;
        const track = stream.getAudioTracks()[0];
        if (!track || track.kind !== "audio" || track.readyState !== "live") throw Error("Selected microphone has no live audio track");
        let analyser = null, data = null;
        if (context) {
          analyser = context.createAnalyser(); analyser.fftSize = 1024;
          micSource = context.createMediaStreamSource(stream); micSource.connect(analyser);
          data = new Uint8Array(analyser.fftSize);
        }
        const started = Date.now();
        mic.device = track.label || "Default input";
        trace("input", `${mode === "test" ? "Test" : "Recognition track"}: ${mic.device}`);
        refreshDevices(token);
        function sample() {
          if (token !== micToken || destroyed) return;
          if (mode === "test" && Date.now() - started >= 15000) { stopMicTest("15-second input test complete. Click Start microphone to recognize speech."); return; }
          if (track.readyState === "ended") {
            stopMicTest("Microphone disconnected or input ended.");
            if (mode === "recognition") onStopRecognition?.();
            return;
          }
          mic.track = trackInfo(track); mic.contextState = context?.state || "unavailable";
          mic.state = mode === "test" ? "testing" : "streaming";
          if (analyser && context.state === "running") {
            analyser.getByteTimeDomainData(data);
            const rms = Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length);
            const db = Math.max(-100, 20 * Math.log10(Math.max(1e-5, rms)));
            mic.currentDb = db; mic.peakDb = Math.max(mic.peakDb ?? -100, db); mic.level = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
            mic.detail = `${mic.device}: ${db > -45 ? "Input signal detected" : "Very quiet or silent"} (${Math.round(db)} dBFS; peak ${Math.round(mic.peakDb)} dBFS)`;
          } else { mic.level = 0; mic.detail = `${mic.device}: meter ${mic.contextState}; input level not measured`; }
          mic.detail += `${track.muted ? " · browser reports input muted" : ""}${!track.enabled ? " · track disabled" : ""}${mode === "recognition" ? " · same track sent to recognition" : ""}.`;
          refresh(); micTimer = window.setTimeout(sample, 100);
        }
        sample(); return track;
      } catch (error) {
        if (token !== micToken || destroyed) return null;
        const detail = `${error?.name || "Error"}: ${error?.message || "Microphone test failed"}`;
        stopMicTest(detail); mic.state = "error"; trace("input", detail, "error"); refresh(); throw error;
      }
    }
    function recognitionInput() {
      const track = micStream?.getAudioTracks()[0];
      return inputMode === "recognition" && track?.readyState === "live" ? track : startInput("recognition");
    }
    function snapshot() {
      return {environment: {...environment}, pack, recognition: {...recognition, recentSessions: recognition.recentSessions.map(session => ({...session}))},
        microphone: {...mic, selection: deviceSelect.selectedOptions[0]?.textContent, availableDevices: devices.map(device => device.label)},
        lastResult: lastResult ? {...lastResult} : null, lastTest,
        slide: {id: getSlide()?.id, page: getSlide()?.page, width: getSlide()?.width, height: getSlide()?.height,
          targets: (getSlide()?.semanticRegions || []).map(r => ({...r}))},
        rules: config.rules.map(rule => ({id: rule.id, phrases: rule.phrases, target: rule.target, action: rule.action, multi: rule.multi})),
        commands: (config.commands || []).map(command => ({id: command.id, phrases: command.phrases, command: command.command})),
        context: describeContext(), stages: JSON.parse(JSON.stringify(stages)), events: history.map(item => ({...item}))};
    }
    stage("match", "Waiting for recognized words or a typed test."); stage("action", "No action requested.");
    stage("artwork", "No emphasis crop requested."); refresh();
    return {support, setPack, status, event, heard, outcome, artwork, refresh, slideChanged, stopMicTest, snapshot, recognitionInput,
      destroy() { stopMicTest(); destroyed = true; section.remove(); history.splice(0); lastResult = null; lastTest = ""; }};
  }
  window.PigeonVoiceDiagnostics = {create};
})();
