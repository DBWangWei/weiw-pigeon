/* Offline page transitions inspired by React Bits. See references/transitions.md.
 * Snapshot only the outgoing artwork and ink; the destination remains the real,
 * interactive slide. No cloned controls, duplicate IDs, or rasterized SVG text.
 */
window.PigeonTransitions = (() => {
  const names = ["camera", "none", "fade", "blur", "slide", "zoom", "pixel", "staggered-wipe", "stack"];
  const easing = "cubic-bezier(.2,.8,.2,1)";
  const svgNS = "http://www.w3.org/2000/svg";
  let nextMask = 0;

  function capture({stage, frame, asset, color = "white"}) {
    if (!frame) return null;
    const stageRect = stage.getBoundingClientRect();
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height || !stageRect.width || !stageRect.height) return null;
    const overlay = document.createElement("div");
    overlay.className = "page-transition-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    overlay.style.background = getComputedStyle(stage).background;
    const page = document.createElement("div");
    page.className = "page-transition-artwork";
    const style = getComputedStyle(frame);
    Object.assign(page.style, {
      left: `${rect.left - stageRect.left}px`, top: `${rect.top - stageRect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, background: color,
      borderRadius: style.borderRadius, boxShadow: style.boxShadow,
    });
    if (asset) {
      const image = document.createElement("img");
      image.src = asset; image.alt = ""; image.draggable = false;
      page.append(image);
    }
    const source = frame.querySelector(".annotation-canvas");
    if (source) {
      const ink = document.createElement("canvas");
      ink.width = source.width; ink.height = source.height;
      ink.getContext("2d")?.drawImage(source, 0, 0);
      page.append(ink);
    }
    overlay.append(page);
    return {stage, overlay, page, width: stageRect.width, height: stageRect.height};
  }

  function create() {
    let current = null;
    function cancel() {
      const job = current;
      if (!job) return;
      current = null;
      clearTimeout(job.timer);
      cancelAnimationFrame(job.raf);
      job.animations.forEach(animation => animation.cancel());
      job.overlay.remove();
      job.mask?.remove();
    }
    function play(snapshot, target, {name, direction = 1, onComplete = () => {}}) {
      cancel();
      if (!snapshot || !target || !names.includes(name) || ["camera", "none"].includes(name) || !target.animate) {
        snapshot?.overlay.remove(); onComplete(); return;
      }
      const {stage, overlay, page, width, height} = snapshot;
      const job = {overlay, animations: [], timer: 0, raf: 0, mask: null};
      current = job;
      overlay.dataset.transition = name;
      stage.append(overlay);
      const finish = () => { if (current === job) { cancel(); onComplete(); } };
      const animate = (element, frames, duration = 460) => {
        const animation = element.animate(frames, {duration, easing, fill: "both"});
        job.animations.push(animation);
        return animation;
      };
      try {
        if (name === "pixel" || name === "staggered-wipe") {
          // A single vector snapshot is clipped by a bounded grid. Rectangles
          // shrink via SVG attributes, avoiding dozens of copied page/canvas nodes.
          const svg = document.createElementNS(svgNS, "svg");
          svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
          svg.setAttribute("aria-hidden", "true");
          svg.style.position = "absolute";
          const clip = document.createElementNS(svgNS, "clipPath");
          const id = `pigeon-page-mask-${++nextMask}`;
          clip.id = id; clip.setAttribute("clipPathUnits", "userSpaceOnUse");
          svg.append(clip); stage.append(svg); job.mask = svg;
          overlay.style.clipPath = `url(#${id})`;
          const columns = name === "pixel" ? 12 : 1;
          const rows = name === "pixel" ? Math.max(4, Math.min(10, Math.round(12 * height / width))) : 6;
          const cells = [];
          for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
            const rect = document.createElementNS(svgNS, "rect");
            const x = col * width / columns, y = row * height / rows;
            const w = width / columns + .5, h = height / rows + .5;
            const delay = name === "pixel" ? ((row * 17 + col * 31) % 23) * 10 : row * 36;
            for (const [key, value] of Object.entries({x, y, width: w, height: h})) rect.setAttribute(key, value);
            clip.append(rect); cells.push({rect, x, y, w, h, delay});
          }
          const started = performance.now();
          const tick = now => {
            if (current !== job) return;
            const elapsed = now - started;
            for (const {rect, x, y, w, h, delay} of cells) {
              const p = Math.min(1, Math.max(0, (elapsed - delay) / 340));
              const remaining = 1 - p * p * (3 - 2 * p);
              rect.setAttribute("width", w * remaining);
              rect.setAttribute("x", x + (name === "pixel" ? w * (1 - remaining) / 2 : direction > 0 ? w * (1 - remaining) : 0));
              if (name === "pixel") {
                rect.setAttribute("height", h * remaining);
                rect.setAttribute("y", y + h * (1 - remaining) / 2);
              }
            }
            if (elapsed >= 580) finish();
            else job.raf = requestAnimationFrame(tick);
          };
          job.raf = requestAnimationFrame(tick);
          job.timer = setTimeout(finish, 700); // Also settle in a background tab.
          return;
        }
        // The background fades too, so different page sizes and aspect ratios
        // never leave a stale border or hide the incoming page after completion.
        const outgoing = animate(overlay, [{opacity: 1}, {opacity: 0}]);
        if (name === "blur") {
          animate(page, [{filter: "blur(0px)"}, {filter: "blur(12px)"}]);
          animate(target, [{filter: "blur(12px)", opacity: 0}, {filter: "blur(0px)", opacity: 1}]);
        } else if (name === "slide") {
          animate(page, [{transform: "translateX(0)"}, {transform: `translateX(${-direction * width}px)`}]);
          animate(target, [{transform: `translateX(${direction * 100}%)`, opacity: 0}, {transform: "translateX(0)", opacity: 1}]);
        } else if (name === "zoom") {
          animate(page, [{transform: "scale(1)"}, {transform: `scale(${direction > 0 ? 1.18 : .82})`}]);
          animate(target, [{transform: `scale(${direction > 0 ? .82 : 1.18})`, opacity: 0}, {transform: "scale(1)", opacity: 1}]);
        } else if (name === "stack") {
          animate(page, [{transform: "rotate(0) scale(1)"}, {transform: `translateX(${-direction * 30}%) rotate(${-direction * 10}deg) scale(.86)`}]);
          animate(target, [{transform: `rotate(${direction * 6}deg) scale(.9)`, opacity: 0}, {transform: "rotate(0) scale(1)", opacity: 1}]);
        }
        outgoing.finished?.then(finish, () => {});
        job.timer = setTimeout(finish, 520);
      } catch (_) {
        // Animation support must never prevent navigation or retain an overlay.
        finish();
      }
    }
    return {play, cancel, get active() { return current !== null; }};
  }
  return {names, capture, create};
})();
