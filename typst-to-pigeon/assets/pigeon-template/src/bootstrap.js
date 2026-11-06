/* Classic scripts work when this folder is opened directly with file://. */
(() => {
  function failed(message) {
    const ready = document.getElementById("readyState");
    ready.textContent = "Unable to start";
    ready.classList.add("warning");
    const empty = document.getElementById("emptyState");
    empty.hidden = false;
    empty.querySelector("p").textContent = message;
  }
  const timer = setTimeout(() => failed(
    window.PIGEON_SINGLE_FILE ? "The presentation did not finish starting. Reopen the HTML file in a current browser." :
    "The presentation did not finish starting. Reopen index.html with its complete presentation folder, or use Start Presentation.command."
  ), 15000);
  window.addEventListener("presentation-started", () => clearTimeout(timer), {once: true});
  window.addEventListener("presentation-start-failed", event => {
    clearTimeout(timer);
    failed(event.detail || "The presentation could not start.");
  }, {once: true});
  function load(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const inline = window.PIGEON_SINGLE_FILE_SCRIPTS?.[path];
      if (inline != null) {
        script.textContent = inline;
        document.body.append(script);
        resolve();
        return;
      }
      if (window.PIGEON_SINGLE_FILE) {
        reject(new Error(`The standalone presentation is missing its embedded runtime: ${path}`));
        return;
      }
      script.src = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Cannot load ${path}. Keep the extracted presentation folder together.`));
      document.body.append(script);
    });
  }
  (async () => {
    if (location.protocol === "file:" && !window.PIGEON_DECK_BUNDLE) await load("public/deck/embedded-deck.js");
    await load("src/ticker.js");
    await load("src/title-effects.js");
    await load("src/wand-effects.js");
    if (!window.PIGEON_SINGLE_FILE) {
      await load("src/voice-diagnostics.js");
      await load("src/voice-local.js");
      await load("src/voice.js");
    }
    await load("src/particle-effects.js");
    await load("src/slide-transitions.js");
    await load("src/diagram.js");
    await load("src/pdf-export.js");
    await load("src/semantic-tiers.js");
    await load("src/tier-renderer.js");
    await load("src/graph-layout.js");
    await load("src/app.js");
  })().catch(error => {
    clearTimeout(timer);
    failed(error.message);
  });
})();
