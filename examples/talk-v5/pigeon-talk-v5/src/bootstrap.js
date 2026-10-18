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
    "The presentation did not finish starting. Re-extract the complete ZIP and reopen index.html, or use Start Presentation.command."
  ), 15000);
  window.addEventListener("presentation-started", () => clearTimeout(timer), {once: true});
  window.addEventListener("presentation-start-failed", event => {
    clearTimeout(timer);
    failed(event.detail || "The presentation could not start.");
  }, {once: true});
  function load(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Cannot load ${path}. Keep the extracted presentation folder together.`));
      document.body.append(script);
    });
  }
  (async () => {
    if (location.protocol === "file:") await load("public/deck/embedded-deck.js");
    await load("src/title-effects.js");
    await load("src/wand-effects.js");
    await load("src/slide-transitions.js");
    await load("src/diagram.js");
    await load("src/pdf-export.js");
    await load("src/app.js");
  })().catch(error => {
    clearTimeout(timer);
    failed(error.message);
  });
})();
