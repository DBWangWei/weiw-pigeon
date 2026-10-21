/* Local speech recognition and transient semantic emphasis. No audio, transcript,
 * or trigger history is persisted. Microphone preparation only starts on a click.
 */
(() => {
  "use strict";
  const DEFAULTS = {
    enabled: true, backend: "whisper", lang: "en-US", boost: 3, cooldownMs: 3000, staleMs: 600,
    resuppressAfterDismissMs: 10000, restartDelayMs: 250, watchdogMs: 90000,
    popPadPt: 6, popMaxFraction: .85, popMaxScale: 4, autoCloseMs: 0,
    rules: [
      {id: "takeaway", target: "takeaway", phrases: ["key message", "key messages", "takeaway", "takeaways", "take-away message", "takeaway message", "take away message", "conclusion", "conclusions"], action: "pop", multi: "stack"},
      {id: "table", target: "_table", phrases: ["this table"], action: "pop", multi: "ask"},
      {id: "figure", target: "_fig", phrases: ["this figure", "this plot"], action: "pop", multi: "ask"},
      {id: "example", target: "_example", phrases: ["this example"], action: "pop", multi: "ask"},
    ],
  };
  const word = /[\p{L}\p{N}\p{M}]/u;
  const unspaced = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase()
      .replace(/[\-\u2010\u2011]/gu, "")
      .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ").replace(/\s+/gu, " ").trim();
  }
  function compileRules(rules) {
    return rules.map(rule => ({...rule, phrases: [...new Set(rule.phrases.map(normalize).filter(Boolean))]
      .sort((a, b) => b.length - a.length || a.localeCompare(b))}));
  }
  function boundary(text, start, end, phrase) {
    const before = [...text.slice(0, start)].pop() || "", after = [...text.slice(end)][0] || "";
    const first = [...phrase][0], last = [...phrase].pop();
    return (!word.test(before) || unspaced.test(first)) && (!word.test(after) || unspaced.test(last));
  }
  // Longest synonyms claim their character span first, so nested phrases count
  // as one occurrence. Unicode boundaries also work without spaces in Chinese.
  function matchRules(value, rules) {
    const text = normalize(value), matches = [];
    for (const rule of rules) {
      const claimed = [];
      for (const phrase of rule.phrases) {
        for (let start = text.indexOf(phrase); start !== -1; start = text.indexOf(phrase, start + 1)) {
          const end = start + phrase.length;
          if (!boundary(text, start, end, phrase) || claimed.some(m => start < m.end && end > m.start)) continue;
          const match = {ruleId: rule.id, phrase, start, end};
          claimed.push(match); matches.push(match);
        }
      }
    }
    return matches.sort((a, b) => a.start - b.start || b.end - a.end);
  }
  function createOccurrenceTracker() {
    const highWater = new Map();
    return {
      consume(index, matches) {
        const counts = new Map(), fresh = [];
        matches.forEach(match => counts.set(match.ruleId, (counts.get(match.ruleId) || 0) + 1));
        counts.forEach((count, ruleId) => {
          const key = `${index}:${ruleId}`, previous = highWater.get(key) || 0;
          if (count > previous) {
            highWater.set(key, count);
            for (let n = previous; n < count; n++) fresh.push(ruleId);
          }
        });
        return fresh;
      },
      clear() { highWater.clear(); },
    };
  }
  function cropBounds(region, slide, pad) {
    const x = Math.max(0, region.x - pad), y = Math.max(0, region.y - pad);
    return {x, y, width: Math.max(0, Math.min(slide.width, region.x + region.width + pad) - x),
      height: Math.max(0, Math.min(slide.height, region.y + region.height + pad) - y)};
  }
  function stackScale(crops, width, height, config, slideScale) {
    const gap = crops.length > 1 ? 16 : 0;
    return Math.max(.001, Math.min(config.popMaxFraction * width / Math.max(...crops.map(c => c.width)),
      Math.max(1, config.popMaxFraction * height - gap * (crops.length - 1)) / crops.reduce((sum, c) => sum + c.height, 0),
      config.popMaxScale * Math.max(.001, slideScale || 1)));
  }
  function create({config = {}, getSlide, assetUrl, canDispatch = () => true, getContextReason = () => "Paused in this view", getScale = () => 1, onEmphasis = () => {}}) {
    const cfg = {...DEFAULTS, ...config};
    cfg.rules = compileRules(Array.isArray(config.rules) ? config.rules : DEFAULTS.rules);
    const rules = new Map(cfg.rules.map(rule => [rule.id, rule]));
    const d = window.document, listeners = [], lastFire = new Map(), dismissed = new Map(), playing = new Set();
    let destroyed = false, want = false, muted = false, prepared = false, recognition = null, SR = null;
    let epoch = 0, failures = 0, emptyAborts = 0, state = cfg.enabled ? "off" : "disabled", reason = cfg.enabled ? "Start when ready" : "Microphone disabled; manual controls available";
    let restartTimer = null, watchdogTimer = null, autoCloseTimer = null, lastEvent = 0;
    let lastSlideChange = Date.now(), overlay = null, open = null, choices = null, debug = false, debugLayer = null;
    let lastWords = "", events = [], biasDisabled = false;
    const slideKey = slide => `${slide?.id ?? ""}:${slide?.page ?? ""}`;
    let currentSlide = slideKey(getSlide());
    const active = () => !destroyed && Boolean(canDispatch()) && playing.size === 0;
    const listenWanted = () => want && !muted && active();
    const addListener = (node, type, fn, options) => {
      node.addEventListener(type, fn, options); listeners.push(() => node.removeEventListener(type, fn, options));
    };
    const element = (tag, cls, text) => {
      const node = d.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node;
    };
    const button = (text, cls, fn) => {
      const node = element("button", cls, text); node.type = "button"; node.addEventListener("click", fn); return node;
    };
    const toolbar = button("Voice", "voice-toggle pigeon-voice-button", () => togglePanel());
    toolbar.id = "voice-toggle"; toolbar.setAttribute("aria-controls", "pigeon-voice-panel");
    toolbar.setAttribute("aria-expanded", "false"); toolbar.title = "Voice triggers and manual emphasis";
    d.querySelector(".top-actions")?.append(toolbar);
    const panel = element("section", "pigeon-voice-panel");
    panel.id = "pigeon-voice-panel"; panel.hidden = true; panel.setAttribute("aria-label", "Voice triggers");
    const header = element("div", "voice-panel-header");
    header.append(element("strong", "", "Voice triggers"), button("Close", "voice-close", () => { panel.hidden = true; updateUI(); }));
    const status = element("p", "voice-status pigeon-voice-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const reasonNode = element("p", "voice-reason pigeon-voice-reason");
    const controls = element("div", "voice-controls");
    const startButton = button("Start microphone", "voice-start", () => {
      if (want) stop(); else start();
    });
    const muteButton = button("Mute", "voice-mute", () => toggleMute());
    const debugButton = button("Show bounds", "voice-debug-toggle", () => toggleDebug());
    controls.append(startButton, muteButton, debugButton);
    const wordsNode = element("p", "voice-last-words pigeon-voice-words"); wordsNode.setAttribute("aria-label", "Last recognized words");
    const manual = element("div", "voice-manual pigeon-voice-rules"); manual.setAttribute("aria-label", "Manual emphasis");
    cfg.rules.forEach(rule => {
      const b = button(rule.id, "voice-rule", () => dispatch(rule.id, "manual")); b.dataset.rule = rule.id; manual.append(b);
    });
    const chips = element("div", "voice-choices pigeon-voice-choices"); chips.setAttribute("aria-label", "Choose an element");
    const logNode = element("ol", "voice-log pigeon-voice-log"); logNode.setAttribute("aria-label", "Recent trigger events");
    panel.append(header, status, reasonNode, controls,
      element("p", "voice-privacy", "Local recognition only. Short audio buffers, words and trigger history stay in memory."), wordsNode, manual, chips, logNode);
    const diagnostics = window.PigeonVoiceDiagnostics?.create({panel, config: cfg, getSlide,
      describeContext: () => active() ? "Presentation ready." : pauseReason(), onTestPhrase: testPhrase,
      onStopRecognition: stop});
    d.body.append(panel);
    function updateUI() {
      if (destroyed) return;
      status.textContent = state; status.dataset.state = state; toolbar.dataset.state = state; panel.dataset.state = state;
      reasonNode.textContent = reason; toolbar.setAttribute("aria-expanded", String(!panel.hidden));
      startButton.disabled = !cfg.enabled;
      startButton.textContent = want ? "Stop microphone" : "Start microphone";
      muteButton.textContent = muted ? "Unmute" : "Mute"; muteButton.setAttribute("aria-pressed", String(muted));
      debugButton.textContent = debug ? "Hide bounds" : "Show bounds"; debugButton.setAttribute("aria-pressed", String(debug));
      diagnostics?.refresh();
    }
    function setState(value, detail = "") { state = value; reason = detail; diagnostics?.status(value, detail, want); updateUI(); }
    function log(rule, source, outcome) {
      diagnostics?.outcome(rule, source, outcome, regionsFor(rule));
      events.unshift({time: Date.now(), ruleId: rule.id, source, outcome, page: getSlide()?.page});
      events = events.slice(0, 10); logNode.replaceChildren();
      events.forEach(event => logNode.append(element("li", "", `${new Date(event.time).toLocaleTimeString()} ${event.source} · ${event.ruleId} → ${event.outcome} (p.${event.page ?? "?"})`)));
    }
    function showWords(value) {
      // Keep only the tail, and never retain a result transcript or alternative.
      const text = normalize(value);
      if (typeof window.Intl?.Segmenter === "function") {
        const words = [...new window.Intl.Segmenter(cfg.lang, {granularity: "word"}).segment(text)].filter(part => part.isWordLike);
        lastWords = text.slice(words.at(-10)?.index ?? 0).slice(-240);
      } else lastWords = text.split(" ").slice(-10).join(" ").slice(-240);
      const ranges = matchRules(lastWords, cfg.rules).sort((a, b) => a.start - b.start);
      wordsNode.replaceChildren(); let cursor = 0;
      for (const range of ranges) {
        if (range.start < cursor) continue;
        wordsNode.append(d.createTextNode(lastWords.slice(cursor, range.start)), element("mark", "voice-trigger-word", lastWords.slice(range.start, range.end)));
        cursor = range.end;
      }
      wordsNode.append(d.createTextNode(lastWords.slice(cursor)));
    }
    function clearRecognition(keepInput = false) {
      epoch++; window.clearTimeout(restartTimer); restartTimer = null;
      window.clearTimeout(watchdogTimer); watchdogTimer = null;
      const old = recognition; recognition = null;
      if (!keepInput) diagnostics?.stopMicTest();
      if (!old) return;
      old.onstart = old.onend = old.onerror = old.onresult = old.onnomatch = old.onaudiostart = old.onaudioend =
        old.onsoundstart = old.onsoundend = old.onspeechstart = old.onspeechend = old.onpipeline = null;
      // Aborting discards queued words when moving slides, muting, or stopping.
      try { old.abort(); } catch (_) { try { old.stop(); } catch (_) {} }
    }
    function pauseReason() { return muted ? "Muted by presenter" : playing.size ? "Paused during media playback" : getContextReason(); }
    function pause() { clearRecognition(); diagnostics?.stopMicTest(); if (want) setState(muted ? "muted" : "paused", pauseReason()); }
    function terminal(detail) { want = false; clearRecognition(); setState("error", detail); }
    function scheduleRestart(detail = "Recognition ended; restarting") {
      clearRecognition(true);
      if (!listenWanted()) { if (want) setState(muted ? "muted" : "paused", pauseReason()); return; }
      setState("restarting", detail);
      const token = epoch;
      const delay = Math.min(5000, cfg.restartDelayMs * 2 ** Math.min(10, Math.max(0, failures - 1)));
      restartTimer = window.setTimeout(() => {
        restartTimer = null; if (token === epoch && listenWanted()) newSession();
      }, delay);
    }
    function armWatchdog(rec, token) {
      window.clearTimeout(watchdogTimer);
      watchdogTimer = window.setTimeout(() => {
        watchdogTimer = null;
        if (recognition !== rec || token !== epoch || !listenWanted()) return;
        if (Date.now() - lastEvent >= cfg.watchdogMs) { failures++; scheduleRestart("Microphone stalled; restarting"); }
        else armWatchdog(rec, token);
      }, Math.max(1, cfg.watchdogMs - (Date.now() - lastEvent)));
    }
    async function newSession() {
      if (!prepared || !listenWanted()) return;
      clearRecognition(true);
      const token = epoch, page = slideKey(getSlide()), tracker = createOccurrenceTracker();
      let rec;
      try {
        rec = new SR(); recognition = rec;
        try { rec.processLocally = true; }
        catch (_) { terminal("On-device recognition could not be enabled"); return; }
        // A browser which refuses local mode must never receive start().
        if (rec.processLocally !== true) return terminal("On-device recognition could not be enabled");
        Object.assign(rec, {lang: cfg.lang, continuous: true, interimResults: true, maxAlternatives: 1});
        if (cfg.backend === "browser" && !biasDisabled && typeof window.SpeechRecognitionPhrase === "function") {
          try { rec.phrases = [...new Set(cfg.rules.flatMap(rule => rule.phrases))].map(phrase => new window.SpeechRecognitionPhrase(phrase, cfg.boost)); }
          catch (_) { biasDisabled = true; }
        }
        const valid = () => !destroyed && recognition === rec && token === epoch && page === slideKey(getSlide()) && listenWanted();
        const alive = () => { if (valid()) { lastEvent = Date.now(); armWatchdog(rec, token); } };
        rec.onstart = () => { if (valid()) { alive(); diagnostics?.event("start"); setState("listening", cfg.backend === "whisper" ? "Local Whisper started; speak, then pause briefly" : "On-device recognizer started; waiting for audio/results"); } };
        rec.onpipeline = event => { if (valid()) { alive(); diagnostics?.event("transcription", event.detail); setState("listening", event.detail); } };
        ["audiostart", "audioend", "soundstart", "soundend", "speechstart", "speechend"].forEach(name => {
          rec[`on${name}`] = () => { if (valid()) { alive(); diagnostics?.event(name); } };
        });
        rec.onnomatch = () => { if (valid()) diagnostics?.event("nomatch", "Speech engine returned no usable recognition match"); };
        rec.onresult = event => {
          if (!valid()) { diagnostics?.event("result ignored", "Detached recognizer, previous slide, muted, or inactive view"); return; }
          alive(); failures = 0; emptyAborts = 0;
          for (let i = event.resultIndex || 0; i < event.results.length; i++) {
            const transcript = event.results[i]?.[0]?.transcript || "";
            showWords(transcript);
            const matches = matchRules(transcript, cfg.rules), fresh = tracker.consume(i, matches);
            diagnostics?.heard({text: transcript, isFinal: Boolean(event.results[i]?.isFinal),
              confidence: event.results[i]?.[0]?.confidence, matches, fresh});
            for (const id of fresh) dispatch(id, "voice");
          }
        };
        rec.onend = () => { if (valid()) { diagnostics?.event("end"); emptyAborts = 0; failures++; scheduleRestart(); } };
        rec.onerror = event => {
          if (!valid()) return;
          const error = event.error || "recognition-error";
          diagnostics?.event("error", `${error}${event.message ? `: ${event.message}` : ""}`);
          if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "local-transcription-failed"].includes(error)) return terminal(event.message ? `${error}: ${event.message}` : error);
          if (error === "phrases-not-supported") { biasDisabled = true; scheduleRestart("Restarting without phrase bias"); return; }
          emptyAborts = error === "aborted" ? emptyAborts + 1 : 0;
          if (emptyAborts >= 3) return terminal("Chrome aborted recognition 3 times without returning words. Click Test microphone, check the selected input, then Start microphone to retry.");
          if (error === "aborted") failures++;
          if (!["aborted", "no-speech"].includes(error)) failures++;
          // Some implementations omit onend after errors; replace the session.
          scheduleRestart(error === "no-speech" ? "No speech; restarting" : `Recognition: ${error}`);
        };
        setState("starting", "Opening microphone stream for on-device recognition");
        let track = null;
        if (diagnostics) {
          try {
            const input = diagnostics.recognitionInput();
            track = input && typeof input.then === "function" ? await input : input;
          }
          catch (error) { if (valid()) terminal(`Microphone input: ${error?.name || "error"}: ${error?.message || "Could not open input"}`); return false; }
          if (!valid()) return false;
          if (!track) { terminal("Microphone has no live audio track"); return false; }
        }
        lastEvent = Date.now(); diagnostics?.event("start requested"); armWatchdog(rec, token);
        if (track) {
          try { rec.start(track); }
          catch (error) { terminal(`Microphone recognition failed: ${error?.name || "error"}: ${error?.message || "Chrome could not start from the audio track"}`); return false; }
        } else rec.start();
        return true;
      } catch (error) {
        diagnostics?.event("error", `${error?.name || "error"}: ${error?.message || "Could not start recognition"}`);
        failures++; scheduleRestart(`Could not start microphone: ${error?.name || "error"}`);
      }
    }
    async function start() {
      if (destroyed) return false;
      if (!cfg.enabled) { setState("disabled", "Microphone disabled; manual controls available"); return false; }
      diagnostics?.stopMicTest();
      clearRecognition(); want = true; failures = 0; emptyAborts = 0;
      if (muted || !active()) { setState(muted ? "muted" : "paused", pauseReason()); return false; }
      if (prepared && cfg.backend === "browser") return newSession();
      const token = epoch;
      setState("preparing", cfg.backend === "whisper" ? "Checking local Whisper server/model" : "Checking on-device language pack");
      try {
        SR = cfg.backend === "whisper" ? window.PigeonLocalSpeech?.Recognition : window.SpeechRecognition || window.webkitSpeechRecognition;
        diagnostics?.support(SR);
        if (!SR || !("processLocally" in SR.prototype) || typeof SR.available !== "function") {
          if (token === epoch) terminal(cfg.backend === "whisper" ? "Local Whisper adapter unavailable. Rebuild or re-extract the presentation." : "On-device speech recognition is unavailable in this browser"); return false;
        }
        const options = {langs: [cfg.lang], processLocally: true};
        diagnostics?.setPack("Checking");
        let availability = await SR.available(options);
        if (token !== epoch || !listenWanted()) return false;
        diagnostics?.setPack(SR.backend === "whisper" ? `${SR.capability?.model || "Whisper"} · ${availability}` : availability);
        if (["downloadable", "downloading"].includes(availability)) {
          if (typeof SR.install !== "function") { terminal("On-device language pack installation is unavailable"); return false; }
          setState("preparing", "Installing on-device language pack");
          diagnostics?.setPack("Installing");
          const installed = await SR.install(options);
          if (token !== epoch || !listenWanted()) return false;
          if (!installed) { terminal("On-device language pack installation failed"); return false; }
          availability = await SR.available(options);
          if (token !== epoch || !listenWanted()) return false;
          diagnostics?.setPack(availability);
        }
        if (availability !== "available") { terminal(`On-device language pack: ${availability}`); return false; }
        prepared = true; return newSession();
      } catch (error) {
        if (token === epoch && !destroyed) {
          diagnostics?.event("error", `${error?.name || "error"}: ${error?.message || "Preparation failed"}`);
          terminal(`On-device preparation failed: ${error?.message || error?.name || "error"}`);
        }
        return false;
      }
    }
    function stop() { want = false; clearRecognition(); diagnostics?.stopMicTest(); setState(cfg.enabled ? "off" : "disabled", "Microphone stopped"); }
    function toggleMute() {
      if (destroyed) return;
      muted = !muted;
      if (muted) { clearRecognition(); diagnostics?.stopMicTest(); setState("muted", "Muted by presenter"); }
      else if (want && prepared && active()) newSession();
      else setState(cfg.enabled ? "off" : "disabled", want ? "Press Start to prepare microphone" : "Microphone stopped");
    }
    function regionsFor(rule) {
      const slide = getSlide();
      return (slide?.semanticRegions || []).filter(region => region.target === rule.target &&
        [region.x, region.y, region.width, region.height].every(Number.isFinite) && region.width > 0 && region.height > 0 &&
        region.x >= 0 && region.y >= 0 && region.x < slide.width && region.y < slide.height)
        .slice().sort((a, b) => a.y - b.y || a.x - b.x);
    }
    function targetKey(region) { return `${currentSlide}:${region.target}:${region.id}`; }
    function closeOverlay(suppress = true) {
      if (!open) return false;
      if (suppress) open.regions.forEach(region => dismissed.set(targetKey(region), Date.now()));
      window.clearTimeout(autoCloseTimer); autoCloseTimer = null;
      diagnostics?.artwork("Emphasis dismissed; no crop overlay displayed.");
      overlay?.remove(); overlay = null; open = null; return true;
    }
    function clearChoices() { if (!choices) return false; choices = null; chips.replaceChildren(); return true; }
    function pulse() {
      if (!overlay) return;
      overlay.dataset.pulses = String(Number(overlay.dataset.pulses || 0) + 1);
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        overlay.querySelector(".voice-pop-stack")?.animate?.([{opacity: .7}, {opacity: 1}], {duration: 180});
      }
    }
    function showOverlay(rule, regions, source) {
      const signature = `${currentSlide}:${rule.id}:${regions.map(r => r.id).join(",")}`;
      if (open?.signature === signature) {
        if (source === "manual") { closeOverlay(); log(rule, source, "dismissed"); return "dismissed"; }
        pulse(); log(rule, source, "already open"); return "pulse";
      }
      closeOverlay(false); clearChoices(); onEmphasis();
      open = {signature, rule, regions, source}; renderOverlay();
      if (cfg.autoCloseMs > 0) autoCloseTimer = window.setTimeout(() => closeOverlay(), cfg.autoCloseMs);
      log(rule, source, `${rule.action} ${regions.map(r => r.id).join(", ")}`); return "shown";
    }
    function renderOverlay() {
      overlay?.remove(); if (!open || !active()) return;
      const {rule, regions} = open, slide = getSlide();
      if (!slide || !(slide.width > 0 && slide.height > 0)) return;
      overlay = element("div", `pigeon-voice-overlay voice-emphasis-${rule.action}`);
      overlay.dataset.action = rule.action; overlay.setAttribute("aria-label", `${rule.id} emphasis`);
      const backdrop = button("", "voice-pop-backdrop pigeon-voice-backdrop", () => closeOverlay()); backdrop.setAttribute("aria-label", "Dismiss emphasis");
      const stack = element("div", "voice-pop-stack pigeon-voice-stack");
      const crops = regions.map(region => cropBounds(region, slide, cfg.popPadPt));
      const scale = stackScale(crops, window.innerWidth || 1280, window.innerHeight || 720, cfg, getScale());
      const url = assetUrl(slide);
      const renderedOverlay = overlay, loaded = new Set(), failed = new Set();
      diagnostics?.artwork(`Loading ${regions.length} SVG crop image(s)…`);
      regions.forEach((region, i) => {
        const crop = crops[i], card = element("div", "voice-pop-card pigeon-voice-card"); card.dataset.region = region.id;
        card.dataset.rendering = "original";
        Object.assign(card.style, {width: `${crop.width * scale}px`, height: `${crop.height * scale}px`, overflow: "hidden", position: "relative"});
        const img = element("img", "voice-pop-artwork"); img.alt = `${rule.target} ${i + 1}`;
        const imageStatus = () => {
          if (overlay !== renderedOverlay || !img.isConnected) return;
          diagnostics?.artwork(failed.size ? `Artwork failed to load for ${[...failed].join(", ")}.` :
            `${loaded.size}/${regions.length} crop images loaded; emphasis overlay attached.`, failed.size ? "error" : loaded.size === regions.length ? "ok" : "info");
        };
        img.addEventListener("load", () => { loaded.add(region.id); imageStatus(); });
        img.addEventListener("error", () => { failed.add(region.id); imageStatus(); });
        img.src = url;
        Object.assign(img.style, {position: "absolute", maxWidth: "none", width: `${slide.width * scale}px`, height: `${slide.height * scale}px`, left: `${-crop.x * scale}px`, top: `${-crop.y * scale}px`});
        card.append(img); stack.append(card);
        if (rule.action === "focus" && ["takeaway", "text"].includes(rule.target) && window.PigeonWandEffects?.textArtwork) {
          window.PigeonWandEffects.textArtwork(url, crop, slide, scale).then(mask => {
            if (!mask || !card.isConnected) return;
            img.src = mask; Object.assign(img.style, {width: "100%", height: "100%", left: "0", top: "0"}); card.dataset.rendering = "text-mask";
          }).catch(() => {});
        }
      });
      const hint = element("p", "voice-pop-hint pigeon-voice-hint", `${rule.action === "focus" ? "Focus" : rule.action === "spotlight" ? "Spotlight" : "Pop-out"} · Esc to dismiss`);
      overlay.append(backdrop, stack, hint); d.body.append(overlay);
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        overlay.animate?.([{opacity: 0}, {opacity: 1}], {duration: 180});
        const origin = d.querySelector(".slide-frame.current")?.getBoundingClientRect();
        const first = regions[0], originX = origin ? origin.left + (first.x + first.width / 2) * getScale() : window.innerWidth / 2;
        const originY = origin ? origin.top + (first.y + first.height / 2) * getScale() : window.innerHeight / 2;
        stack.animate?.([{transform: `translate(${originX - window.innerWidth / 2}px,${originY - window.innerHeight / 2}px) scale(.8)`, opacity: .5}, {transform: "none", opacity: 1}], {duration: rule.action === "spotlight" ? 320 : 240, easing: "cubic-bezier(.2,.9,.2,1)"});
      }
    }
    function choose(index) {
      if (!choices || !active()) return false;
      const choice = choices, region = choice.regions[index]; if (!region) return false;
      clearChoices(); showOverlay(choice.rule, [region], "manual"); return true;
    }
    function dispatch(ruleId, source = "manual") {
      const rule = rules.get(ruleId); if (!rule || destroyed) return "inactive";
      if (!active()) { log(rule, source, `blocked: ${pauseReason()}`); return "inactive"; }
      const now = Date.now(), voice = source === "voice";
      if (voice) {
        let suppression = !want ? "recognition stopped" : muted ? "muted by presenter" :
          now - lastSlideChange < cfg.staleMs ? `slide change safety delay (${cfg.staleMs - (now - lastSlideChange)} ms remaining)` :
          now - (lastFire.get(rule.id) ?? -Infinity) < cfg.cooldownMs ? `cooldown (${cfg.cooldownMs - (now - lastFire.get(rule.id))} ms remaining)` : "";
        if (suppression) { log(rule, source, `suppressed: ${suppression}`); return "suppressed"; }
      }
      const regions = regionsFor(rule);
      if (!regions.length) { log(rule, source, "none on slide"); return "none"; }
      if (!voice && open?.rule.id === rule.id) {
        closeOverlay(); clearChoices(); log(rule, source, "dismissed"); return "dismissed";
      }
      if (voice && regions.some(region => now - (dismissed.get(targetKey(region)) ?? -Infinity) < cfg.resuppressAfterDismissMs)) {
        log(rule, source, "suppressed: recently dismissed target"); return "suppressed";
      }
      if (voice) lastFire.set(rule.id, now);
      if (regions.length > 1 && rule.multi === "ask") {
        if (source === "manual" && choices?.rule.id === rule.id) { clearChoices(); log(rule, source, "choices dismissed"); return "dismissed"; }
        closeOverlay(false); clearChoices(); choices = {rule, regions}; chips.replaceChildren();
        regions.forEach((region, index) => {
          const b = button(`${index + 1}. ${rule.target} (${Math.round(region.x)}, ${Math.round(region.y)})`, "voice-choice", () => choose(index)); b.dataset.region = region.id; chips.append(b);
        });
        panel.hidden = false; updateUI(); log(rule, source, `choose 1–${Math.min(9, regions.length)}`); return "choices";
      }
      return showOverlay(rule, regions, source);
    }
    function testPhrase(text) {
      const matches = matchRules(text, cfg.rules), fresh = [...new Set(matches.map(match => match.ruleId))];
      diagnostics?.heard({text, matches, fresh, source: "typed"});
      for (const id of fresh) dispatch(id, "typed");
    }
    function renderDebug() {
      debugLayer?.remove(); debugLayer = null;
      if (!debug || !active()) return;
      const frame = d.querySelector(".slide-frame.current"), slide = getSlide(); if (!frame || !slide) return;
      debugLayer = element("div", "voice-debug-layer pigeon-voice-debug"); debugLayer.setAttribute("aria-hidden", "true");
      (slide.semanticRegions || []).forEach(region => {
        const box = element("div", "voice-debug-box pigeon-voice-bound", `${region.target} · ${region.id}`);
        Object.assign(box.style, {left: `${region.x}px`, top: `${region.y}px`, width: `${region.width}px`, height: `${region.height}px`});
        debugLayer.append(box);
      }); frame.append(debugLayer);
    }
    function toggleDebug() { debug = !debug; renderDebug(); updateUI(); }
    function togglePanel() { if (!destroyed) { panel.hidden = !panel.hidden; updateUI(); } }
    function dismiss() {
      if (closeOverlay()) return true;
      if (clearChoices()) return true;
      if (debug) { toggleDebug(); return true; }
      if (!panel.hidden) { panel.hidden = true; updateUI(); return true; }
      return false;
    }
    function key(event) {
      if (destroyed || event.ctrlKey || event.altKey || event.metaKey || event.repeat ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "") || event.target?.isContentEditable) return false;
      const lower = event.key.toLowerCase();
      if (event.shiftKey && lower === "m") { toggleMute(); return true; }
      if (event.shiftKey && lower === "d") { toggleDebug(); return true; }
      if (!active()) return false;
      const defaults = {k: "takeaway", t: "table", f: "figure", e: "example"};
      if (event.shiftKey && defaults[lower] && rules.has(defaults[lower])) { dispatch(defaults[lower]); return true; }
      if (!event.shiftKey && /^[1-9]$/.test(event.key) && choices) return choose(Number(event.key) - 1);
      return false;
    }
    function contextChanged() {
      if (destroyed) return;
      const nextSlide = slideKey(getSlide());
      if (nextSlide !== currentSlide) { slideChanged(); return; }
      playing.forEach(media => { if (!media.isConnected || media.paused || media.ended) playing.delete(media); });
      if (!active()) {
        closeOverlay(false); clearChoices(); debugLayer?.remove(); debugLayer = null;
        diagnostics?.stopMicTest();
        if (recognition || restartTimer || state === "preparing") pause();
      } else if (want && !muted && prepared && !recognition && !restartTimer) newSession();
      else if (want && !muted && !prepared && state === "paused") setState("off", "Press Start to prepare microphone");
      renderDebug();
      diagnostics?.refresh();
    }
    function slideChanged() {
      if (destroyed) return;
      currentSlide = slideKey(getSlide()); lastSlideChange = Date.now();
      closeOverlay(false); clearChoices(); lastFire.clear(); dismissed.clear(); lastWords = ""; wordsNode.replaceChildren();
      clearRecognition();
      diagnostics?.stopMicTest();
      diagnostics?.slideChanged();
      // Detached callbacks and a new recognizer prevent prior-page results from
      // becoming current-page actions even after the stale-time barrier expires.
      if (listenWanted() && prepared) newSession();
      else if (want) setState(muted ? "muted" : "paused", prepared ? pauseReason() : "Press Start to prepare microphone");
      renderDebug();
    }
    function mediaEvent(event) {
      const media = event.target;
      if (!media || !["AUDIO", "VIDEO"].includes(media.tagName)) return;
      if (event.type === "play") playing.add(media); else playing.delete(media);
      contextChanged();
    }
    ["play", "pause", "ended", "emptied"].forEach(type => addListener(d, type, mediaEvent, true));
    addListener(window, "resize", () => { if (open) renderOverlay(); renderDebug(); });
    updateUI();
    function destroy() {
      if (destroyed) return;
      want = false; clearRecognition(); closeOverlay(false); clearChoices();
      destroyed = true; listeners.forEach(remove => remove()); playing.clear();
      debugLayer?.remove(); panel.remove(); toolbar.remove();
      diagnostics?.destroy();
      lastFire.clear(); dismissed.clear(); events = []; lastWords = "";
    }
    return {key, slideChanged, dismiss, contextChanged, dispatch, destroy, togglePanel, toggleMute, start, stop,
      snapshot: () => ({state, reason, want, muted, prepared, failures, panelOpen: !panel.hidden, lastWords,
        events: events.map(event => ({...event})), choices: choices?.regions.map(region => region.id) || [],
        open: open ? {ruleId: open.rule.id, regionIds: open.regions.map(region => region.id), action: open.rule.action} : null,
        debug, diagnostics: diagnostics?.snapshot()})};
  }
  window.PigeonVoice = {create, normalize, compileRules, matchRules, createOccurrenceTracker, cropBounds, stackScale};
})();
