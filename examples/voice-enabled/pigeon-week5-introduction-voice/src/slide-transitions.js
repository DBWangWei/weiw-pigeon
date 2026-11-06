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
      const currentImage = frame.querySelector(":scope > img");
      image.src = frame.dataset.titleActive ? asset : currentImage?.src || asset;
      if (currentImage) image.style.opacity = currentImage.style.opacity;
      image.alt = ""; image.draggable = false;
      page.append(image);
    }
    const tier = frame.querySelector(".tier-decoration");
    if (tier) {
      const nativeWidth=parseFloat(frame.style.width) || rect.width;
      const nativeHeight=parseFloat(frame.style.height) || rect.height;
      const composition=document.createElement("div");
      Object.assign(composition.style,{position:"absolute",left:"0",top:"0",width:nativeWidth+"px",height:nativeHeight+"px",transform:`scale(${rect.width/nativeWidth},${rect.height/nativeHeight})`,transformOrigin:"top left"});
      composition.append(tier.cloneNode(true));page.append(composition);
    }
    const source = frame.querySelector(".annotation-canvas");
    if (source) {
      const ink = document.createElement("canvas");
      ink.width = source.width; ink.height = source.height;
      ink.getContext("2d")?.drawImage(source, 0, 0);
      page.append(ink);
    }
    const labels = frame.querySelector(".diagram-label-layer");
    if (labels) page.append(labels.cloneNode(true));
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
    function playParticle(snapshot, target, {duration = 1400, cell = 10, direction = 1, onComplete = () => {}} = {}) {
      cancel();
      if (!snapshot || !target || !window.PigeonParticleEffects || !target.getBoundingClientRect) {
        snapshot?.overlay.remove(); onComplete(); return;
      }
      const stage = snapshot.stage;
      const stageRect = stage.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (!targetRect.width || !targetRect.height || !stageRect.width || !stageRect.height) {
        snapshot.overlay.remove(); onComplete(); return;
      }
      const sourceImage = snapshot.page.querySelector("img")?.src;
      const targetImage = target.querySelector(":scope > img")?.src;
      if (!sourceImage || !targetImage) { snapshot.overlay.remove(); onComplete(); return; }
      const overlay = document.createElement("div");
      overlay.className = "page-transition-overlay particle-morph-overlay";
      overlay.setAttribute("aria-hidden", "true"); overlay.inert = true;
      overlay.style.background = getComputedStyle(stage).background;
      const page = document.createElement("div"); page.className = "page-transition-artwork particle-morph-page";
      Object.assign(page.style, {
        left: `${targetRect.left - stageRect.left}px`, top: `${targetRect.top - stageRect.top}px`,
        width: `${targetRect.width}px`, height: `${targetRect.height}px`, background: "white",
      });
      const from = document.createElement("img"), to = document.createElement("img");
      from.src = sourceImage; to.src = targetImage; from.alt = to.alt = ""; from.draggable = to.draggable = false;
      from.className = "particle-morph-source"; to.className = "particle-morph-target";
      const canvas = document.createElement("canvas"); canvas.className = "particle-morph-canvas";
      const context = canvas.getContext("2d", {willReadFrequently: true});
      if (!context) { snapshot.overlay.remove(); onComplete(); return; }
      page.append(from, to, canvas); overlay.append(page); stage.append(overlay);
      const job = {overlay, animations: [], timer: 0, raf: 0, mask: null}; current = job;
      const load = image => new Promise((resolve, reject) => {
        if (image.complete && image.naturalWidth) return resolve(image);
        image.onload = () => resolve(image); image.onerror = reject;
      });
      const finish = () => {
        if (current !== job) return;
        current = null; clearTimeout(job.timer); cancelAnimationFrame(job.raf);
        overlay.remove(); snapshot.overlay.remove(); onComplete();
      };
      Promise.all([load(from), load(to)]).then(() => {
        if (current !== job) return;
        const nativeWidth = Number(target.style.width.replace("px", "")) || 960;
        const nativeHeight = Number(target.style.height.replace("px", "")) || Math.round(nativeWidth * targetRect.height / targetRect.width);
        canvas.width = nativeWidth; canvas.height = nativeHeight;
        const sourceCanvas = document.createElement("canvas"), targetCanvas = document.createElement("canvas");
        sourceCanvas.width = targetCanvas.width = nativeWidth; sourceCanvas.height = targetCanvas.height = nativeHeight;
        const sourceContext = sourceCanvas.getContext("2d", {willReadFrequently: true}), targetContext = targetCanvas.getContext("2d", {willReadFrequently: true});
        if (!sourceContext || !targetContext) { finish(); return; }
        sourceContext.drawImage(from, 0, 0, nativeWidth, nativeHeight); targetContext.drawImage(to, 0, 0, nativeWidth, nativeHeight);
        const sourcePixels = sourceContext.getImageData(0, 0, nativeWidth, nativeHeight);
        const targetPixels = targetContext.getImageData(0, 0, nativeWidth, nativeHeight);
        const fx = window.PigeonParticleEffects;
        const particles = fx.pairParticles(fx.sampleGrid(sourcePixels, cell), fx.sampleGrid(targetPixels, cell));
        const draw = (progress) => {
          context.clearRect(0, 0, nativeWidth, nativeHeight);
          const cross = fx.smooth(progress);
          from.style.opacity = String(1 - cross); to.style.opacity = String(cross);
          context.save();
          for (const particle of particles) {
            const point = fx.position(particle, progress, nativeWidth / 2, nativeHeight / 2); if (point.opacity <= 0) continue;
            const width = (particle.from.w + (particle.to.w - particle.from.w) * point.mix) * point.scale;
            const height = (particle.from.h + (particle.to.h - particle.from.h) * point.mix) * point.scale;
            if (point.mix < 1 && particle.from.opacity) {
              context.globalAlpha = point.opacity * (1 - point.mix);
              context.drawImage(sourceCanvas, particle.from.sx, particle.from.sy, particle.from.w, particle.from.h, point.x - width / 2, point.y - height / 2, width, height);
            }
            if (point.mix > 0 && particle.to.opacity) {
              context.globalAlpha = point.opacity * point.mix;
              context.drawImage(targetCanvas, particle.to.sx, particle.to.sy, particle.to.w, particle.to.h, point.x - width / 2, point.y - height / 2, width, height);
            }
          }
          context.restore(); job.progress = progress;
        };
        const started = performance.now();
        const frame = now => {
          if (current !== job) return;
          const progress = fx.clamp((now - started) / Math.max(250, duration)); draw(progress);
          if (progress >= 1) finish(); else job.raf = requestAnimationFrame(frame);
        };
        draw(0); job.raf = requestAnimationFrame(frame); job.timer = setTimeout(finish, Math.max(500, duration + 250));
        overlay.dataset.particleCount = String(particles.length);
      }).catch(() => finish());
    }
    return {play, playParticle, cancel, get active() { return current !== null; }};
  }
  return {names, capture, create};
})();
