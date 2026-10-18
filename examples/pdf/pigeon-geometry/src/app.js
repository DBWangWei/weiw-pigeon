/*
 * Pigeon canvas presentation. This is intentionally dependency-free: the generated
 * deck is a set of JSON/SVG assets, and this shell keeps working while those
 * assets are being regenerated.
 */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PIGEON_VERSION = "1.0.2";
const fileMode = window.location.protocol === "file:";
const embeddedDeck = fileMode ? (window.PIGEON_DECK_BUNDLE || window.TALK_DECK_BUNDLE) : null;
const deckAsset = path => path.startsWith("public/") ? path : `public/deck/${path}`;
function assetUrl(path) {
  if (!fileMode) return path;
  const url = embeddedDeck?.assets?.[path];
  if (!url) throw new Error(`The file-opening bundle is missing ${path}. Re-extract the complete ZIP.`);
  return url;
}
// The deck revision is appended below, so sessions from separate generated
// presentations never collide even when they are opened from the same origin.
const STORAGE_KEY = "pigeon-session-v1";
const undoStacks = {},
  redoStacks = {};
let routeCursor = 0,
  spaceDown = false,
  suppressSpace = false;
let sessionDb = null;
let boardName = "Main";
let boardReturnCamera = null;
let restoredSession = false;
let backupKey = null;
let persistenceSuspended = false;
let presentationRequest = 0;
let booting = true;
const pageTransitions = PigeonTransitions.create();
let pageTransitionPending = false;
let pageTransitionRequest = 0;
let cameraTransitionTimer = null;
let diagram = null;
const COLORS = {
  red: "#DC2626",
  blue: "#2563EB",
  green: "#166534",
  yellow: "#FACC15",
};

const state = {
  deck: {
    id: "",
    title: "",
    revision: "",
    slides: [],
    sections: [],
    route: [],
  },
  graph: { concepts: [], relationships: [] },
  manifestError: null,
  graphError: null,
  currentId: "",
  currentIndex: 0,
  camera: { x: 0, y: 0, scale: 1 },
  autoFit: true,
  tool: "navigate",
  stickyPen: false,
  color: COLORS.red,
  mode: "hierarchy",
  overview: false,
  presentation: false,
  whiteboard: false,
  boardMeta: {},
  hierarchyFocus: null,
  blackout: false,
  detourReturn: null,
  history: [],
  historyIndex: -1,
  visited: new Set(),
  annotations: {},
  boards: {},
  currentStroke: null,
  searchResults: [],
  searchIndex: 0,
  graphFocus: null,
  titleEffect: "none",
  slideTransition: "camera",
  reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches,
};

const els = {
  app: $("#app"),
  stage: $("#stage"),
  world: $("#canvasWorld"),
  title: $("#deckTitle"),
  ready: $("#readyState"),
  position: $("#positionLabel"),
  detour: $("#detourLabel"),
  resumeHud: $("#resumeHud"),
  routeProgress: $("#routeProgress"),
  routeText: $("#routeText"),
  zoom: $("#zoomLabel"),
  overview: $("#overviewPanel"),
  overviewContent: $("#overviewContent"),
  search: $("#searchDialog"),
  searchInput: $("#searchInput"),
  searchResults: $("#searchResults"),
  help: $("#helpDialog"),
  about: $("#aboutDialog"),
  concept: $("#conceptDialog"),
  conceptContent: $("#conceptContent"),
  demo: $("#demoDialog"),
  demoFrame: $("#demoFrame"),
  toast: $("#toast"),
  blackout: $("#blackoutScreen"),
  laser: Object.assign(document.createElement("div"), {
    className: "laser-dot",
  }),
};
document.body.append(els.laser);

function normaliseManifest(raw) {
  const deck = raw.deck || raw;
  const sourceSlides = deck.slides || raw.pages || [];
  if (!Array.isArray(sourceSlides) || sourceSlides.length === 0)
    throw new Error("manifest has no slides");
  const slides = sourceSlides.map((s, i) => ({
    id: String(s.id ?? s.sourceId ?? String(i + 1).padStart(2, "0")),
    title: s.title || s.navigationLabel || `Slide ${i + 1}`,
    width: Number(s.width || deck.dimensions?.width || 960),
    height: Number(s.height || deck.dimensions?.height || 540),
    titleLayer: s.titleLayer || null,
    navigationLabel: s.navigationLabel || s.title || `Slide ${i + 1}`,
    readingText: s.text || "",
    section: s.section || "Talk",
    summary: s.summary || s.description || "",
    page: Number(s.page ?? s.physicalPage ?? i + 1),
    text: [
      s.title,
      s.navigationLabel,
      s.section,
      s.summary,
      s.text,
      s.sourceNote,
      s.source,
      ...(s.imageDescriptions || []),
      s.imageDescription,
    ]
      .filter(Boolean)
      .join(". "),
    asset:
      s.asset ||
      s.assetPath ||
      s.svg ||
      `public/deck/slides/page-${String(i + 1).padStart(2, "0")}.svg`,
    links: s.links || s.linkRegions || [],
    imageDescription: s.imageDescription || "",
    textRegions: (Array.isArray(s.textRegions) ? s.textRegions : []).filter(region =>
      [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
      region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0 &&
      region.x + region.width <= Number(s.width || deck.dimensions?.width || 960) + .001 && region.y + region.height <= Number(s.height || deck.dimensions?.height || 540) + .001),
    wandRegions: (Array.isArray(s.wandRegions) ? s.wandRegions :
      (Array.isArray(s.textRegions) ? s.textRegions : [])).filter(region =>
      [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
      region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0 &&
      region.x + region.width <= Number(s.width || deck.dimensions?.width || 960) + .001 && region.y + region.height <= Number(s.height || deck.dimensions?.height || 540) + .001 &&
      ["text", "image", "table", "takeaway"].includes(region.kind || "text")),
  }));
  const sections = Array.isArray(deck.hierarchy)
    ? [
        { id: "home", label: "Home", slides: [slides[0].id] },
        ...deck.hierarchy
          .filter((s) => s.id !== "root")
          .map((s) => ({ id: s.id, label: s.label, slides: s.children || [] })),
      ]
    : Array.isArray(deck.sections)
      ? deck.sections.map((s) => ({
          id: s.id || s.label,
          label: s.label || s.title,
          summary: s.summary || "",
          slides: s.slides || s.childIds || [],
        }))
      : buildSections(slides);
  const ids = new Set(slides.map((slide) => slide.id));
  const route =
    deck.defaultRoute || deck.route || slides.map((slide) => slide.id);
  if (
    deck.schemaVersion !== "1.0" ||
    !deck.revision ||
    ids.size !== slides.length ||
    !Array.isArray(route) ||
    route.length !== slides.length ||
    new Set(route).size !== route.length ||
    route.some((id) => !ids.has(id)) ||
    slides.some((slide) => !slide.asset || !Number.isInteger(slide.page) ||
      !Number.isFinite(slide.width) || !Number.isFinite(slide.height) || slide.width <= 0 || slide.height <= 0)
  )
    throw new Error("Invalid manifest version, slide IDs, pages, or route.");
  return {
    id: deck.id || deck.deckId || "pigeon-deck",
    focusRegions: deck.focusRegions || [],
    pdf: deckAsset(deck.pdf || `${deck.deckId || deck.id}.pdf`),
    resources: deck.resources || [],
    titleEffect: deck.titleEffect || "none",
    slideTransition: PigeonTransitions.names.includes(deck.slideTransition) ? deck.slideTransition : "camera",
    title: deck.title || "Pigeon presentation",
    revision: deck.revision || deck.contentRevision || "generated",
    slides,
    sections,
    route: deck.defaultRoute || deck.route || slides.map((s) => s.id),
  };
}
function buildSections(slides) {
  const map = new Map();
  slides.forEach((s) => {
    const key = s.section || "Talk";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s.id);
  });
  return [...map].map(([label, ids], i) => ({
    id: `section-${i}`,
    label,
    summary: "",
    slides: ids,
  }));
}
function normaliseGraph(raw) {
  if (!raw || raw.schemaVersion !== "1.0" || raw.deckId !== state.deck.id)
    throw new Error("The knowledge graph is missing or incompatible.");
  if (raw.revision !== state.deck.revision)
    throw new Error(
      "The knowledge graph belongs to a different deck revision. Rebuild it before graph navigation.",
    );
  if (
    !Array.isArray(raw.concepts) ||
    !raw.concepts.length ||
    !Array.isArray(raw.relationships)
  )
    throw new Error(
      "The knowledge graph has no valid concepts or relationships.",
    );
  const slideIds = new Set(state.deck.slides.map((slide) => slide.id));
  const ids = new Set();
  const concepts = raw.concepts.map((node) => {
    if (
      !node ||
      typeof node.id !== "string" ||
      ids.has(node.id) ||
      typeof node.label !== "string" ||
      !Array.isArray(node.mentions) ||
      !node.mentions.length
    )
      throw new Error(
        "The knowledge graph contains an invalid or duplicate concept.",
      );
    ids.add(node.id);
    if (
      node.mentions.some(
        (mention) =>
          !slideIds.has(mention.slideId) ||
          typeof (mention.evidence || mention.text) !== "string",
      )
    )
      throw new Error("A concept has invalid slide evidence.");
    return {
      ...node,
      aliases: Array.isArray(node.aliases) ? node.aliases : [],
      slides: [...new Set(node.mentions.map((mention) => mention.slideId))],
    };
  });
  const relationships = raw.relationships.map((edge) => {
    if (
      !edge ||
      !ids.has(edge.source) ||
      !ids.has(edge.target) ||
      typeof edge.predicate !== "string" ||
      !Array.isArray(edge.evidence) ||
      !edge.evidence.length ||
      edge.evidence.some(
        (item) =>
          !slideIds.has(item.slideId) ||
          typeof (item.evidence || item.text) !== "string",
      )
    )
      throw new Error(
        "The knowledge graph has an invalid relationship or evidence reference.",
      );
    return { ...edge };
  });
  return {
    ...raw,
    concepts: layoutGraph(concepts, relationships),
    relationships,
  };
}
function layoutGraph(concepts, relationships) {
  // Group by explicit cluster or the section containing most original mentions.
  const clusters = new Map();
  for (const node of concepts) {
    const counts = new Map();
    for (const id of node.slides) {
      const section = state.deck.sections.find((section) =>
        section.slides.includes(id),
      );
      const label = section?.label || "Across the talk";
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const cluster = String(
      node.cluster ||
        [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ||
        "Across the talk",
    );
    if (!clusters.has(cluster)) clusters.set(cluster, []);
    clusters.get(cluster).push({ ...node, cluster });
  }
  const groups = [...clusters].sort((a, b) => a[0].localeCompare(b[0]));
  const columns = groups.length > 1 ? 2 : 1;
  const rows = Math.ceil(groups.length / columns);
  const output = [];
  groups.forEach(([label, nodes], index) => {
    const width = 960 / columns,
      height = 660 / rows;
    const centerX = ((index % columns) + 0.5) * width + 10;
    const centerY = (Math.floor(index / columns) + 0.5) * height + 20;
    nodes.sort(
      (a, b) =>
        (b.importance || 0) - (a.importance || 0) || a.id.localeCompare(b.id),
    );
    const localColumns = Math.min(
      4,
      Math.ceil(Math.sqrt((nodes.length * width) / height)),
    );
    const localRows = Math.ceil(nodes.length / localColumns);
    nodes.forEach((node, localIndex) =>
      output.push({
        ...node,
        radius: 13 + Math.min(5, Number(node.importance) || 0),
        x:
          centerX -
          width * 0.41 +
          (((localIndex % localColumns) + 0.5) * width * 0.82) / localColumns,
        y:
          centerY -
          height * 0.32 +
          ((Math.floor(localIndex / localColumns) + 0.5) * height * 0.7) /
            localRows,
        clusterBounds: {
          x: centerX - width * 0.46,
          y: centerY - height * 0.4,
          width: width * 0.92,
          height: height * 0.84,
          label: state.deck.sections.find((section) => section.id === label)?.label || label,
        },
      }),
    );
  });
  return output;
}

async function loadJson(path) {
  if (fileMode) {
    const data = embeddedDeck?.json?.[path];
    if (!data) throw new Error(`The file-opening bundle is missing ${path}. Re-extract the complete ZIP.`);
    return structuredClone(data);
  }
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}
async function loadDeck() {
  try {
    state.deck = normaliseManifest(await loadJson("public/deck/manifest.json"));
    state.manifestError = null;
  } catch (error) {
    state.manifestError = `Unable to load the deck: ${error.message}`;
    els.ready.textContent = "Deck unavailable";
    els.ready.classList.add("warning");
    const empty = $("#emptyState");
    empty.hidden = false;
    empty.querySelector("h2").textContent = "Unable to load this presentation";
    empty.querySelector("p").textContent =
      `${state.manifestError} Re-extract the complete ZIP, or use the local launcher and retry.`;
    $$("button", els.app).forEach((button) => (button.disabled = true));
    $("#helpButton").disabled = false;
    return false;
  }
  try {
    state.graph = normaliseGraph(
      await loadJson("public/deck/knowledge-graph.json"),
    );
    state.graphError = null;
  } catch (error) {
    state.graph = { concepts: [], relationships: [] };
    state.graphError = error.message;
  }
  const graphTab = $('.overview-tab[data-view="graph"]');
  graphTab.disabled = !!state.graphError;
  graphTab.title = state.graphError || "Explore the deck concepts";
  state.currentId = state.deck.route[0];
  state.currentIndex = state.deck.slides.findIndex(
    (slide) => slide.id === state.currentId,
  );
  document.title = `Pigeon · ${state.deck.title}`;
  if (els.about) els.about.querySelector(".about-version").textContent = `Version ${PIGEON_VERSION}`;
  $("#pdfLink").href = state.deck.pdf;
  state.visited.add(state.currentId);
  state.titleEffect = state.deck.titleEffect;
  try { state.titleEffect = localStorage.getItem(`pigeon-title-effect:${state.deck.id}`) || state.titleEffect; } catch (_) {}
  if (!PigeonTitleEffects.names.includes(state.titleEffect)) state.titleEffect = "none";
  $("#titleEffectSelect").value = state.titleEffect;
  state.slideTransition = state.deck.slideTransition;
  $("#slideTransitionSelect").value = state.slideTransition;
  els.title.textContent = state.deck.title;
  els.title.title = state.deck.title;
  els.ready.textContent = state.graphError
    ? "Graph unavailable"
    : "Checking local assets…";
  els.ready.classList.toggle("loading", false);
  els.ready.classList.toggle("warning", !!state.graphError);
  renderFrames();
  renderOverview();
  updateUI();
  verifyAssets();
  return true;
}

let lastTitleFrame = null;
let titleRequest = 0;
let titleCleanup = null;
function stopTitleEffect() {
  titleRequest++;
  titleCleanup?.(); titleCleanup = null;
  $$(".title-artwork").forEach(el => el.remove());
  $$(".slide-frame[data-title-active]").forEach(frame => {
    const slide = getSlide(frame.dataset.slideId);
    frame.querySelector("img").src = assetUrl(deckAsset(slide.asset));
    delete frame.dataset.titleActive;
  });
}
async function syncTitleEffect(force = false) {
  if (pageTransitionPending) return;
  const key = `${activeFrameKey()}:${state.titleEffect}:${state.reducedMotion}`;
  if (!force && lastTitleFrame === key) return;
  lastTitleFrame = key;
  stopTitleEffect();
  const slide = getSlide();
  if (state.whiteboard || state.reducedMotion || state.titleEffect === "none" || !slide?.titleLayer) return;
  const request = titleRequest;
  const frame = $(".slide-frame.current");
  if (!frame) return;
  try {
    const path = deckAsset(slide.titleLayer.asset);
    const svgText = fileMode ? embeddedDeck.titleSvgs?.[path] : await fetch(path).then(r => {if (!r.ok) throw new Error(path); return r.text();});
    if (!svgText) throw new Error("Missing title layer");
    const layer = PigeonTitleEffects.create(svgText, slide.width, slide.height);
    const base = new Image(); base.src = assetUrl(deckAsset(slide.titleLayer.baseAsset));
    if (base.decode) await base.decode();
    if (request !== titleRequest || !frame.isConnected) return;
    frame.querySelector("img").src = base.src;
    frame.dataset.titleActive = "true";
    frame.append(layer);
    titleCleanup = PigeonTitleEffects.play(layer, state.titleEffect, slide.titleLayer.rect);
  } catch (error) {
    if (request === titleRequest) { stopTitleEffect(); toast(`Title effect unavailable: ${error.message}`); }
  }
}
$("#titleEffectSelect").addEventListener("change", event => {
  state.titleEffect = event.target.value;
  try { localStorage.setItem(`pigeon-title-effect:${state.deck.id}`, state.titleEffect); } catch (_) {}
  syncTitleEffect(true);
});
$("#slideTransitionSelect").addEventListener("change", event => {
  cancelPageTransition();
  state.slideTransition = PigeonTransitions.names.includes(event.target.value) ? event.target.value : "camera";
  clearTimeout(cameraTransitionTimer);
  els.world.style.transition = "none";
  syncTitleEffect(true);
});

function cancelPageTransition() {
  pageTransitionRequest++;
  pageTransitionPending = false;
  pageTransitions.cancel();
}
function getSlide(id = state.currentId) {
  return state.deck.slides.find((s) => s.id === id);
}
function slideSize(id = state.currentId) {
  const slide = getSlide(id);
  return {width: slide?.width || 960, height: slide?.height || 540};
}
function layoutSize() {
  return {width: Math.max(...state.deck.slides.map(s => s.width)), height: Math.max(...state.deck.slides.map(s => s.height))};
}
function viewSequence(metadata = state.boardMeta) {
  return state.deck.slides.flatMap(slide => [
    {id: slide.id, name: null},
    ...Object.entries(metadata)
      .filter(([key, meta]) => key.startsWith(`${slide.id}::`) && meta.inserted)
      .map(([key]) => ({id: slide.id, name: key.split("::")[1]})),
  ]);
}
function frameKey(id, name = null) { return name ? `board:${id}::${name}` : `slide:${id}`; }
function activeFrameKey() { return frameKey(state.currentId, state.whiteboard ? boardName : null); }
function boardInfo(id = state.currentId, name = boardName) {
  return state.boardMeta[`${id}::${name}`] || {color: "white", kept: false, inserted: true};
}
function parentCameraFor(id) {
  const entry = state.history.slice().reverse().find(view => view.id === id && !view.board);
  if (entry) return {...entry.camera};
  const bounds = els.stage.getBoundingClientRect();
  const {width, height} = slideSize(id);
  const scale = Math.min(bounds.width / (width + 120), bounds.height / (height + 130), 1.25);
  const position = framePosition(state.deck.slides.findIndex(slide => slide.id === id));
  return {scale, x: -(position.x + width / 2) * scale, y: -(position.y + height / 2) * scale};
}
function framePosition(index, name = null, sequence = viewSequence()) {
  const size = slideSize(state.deck.slides[index]?.id);
  const cell = layoutSize();
  index = Math.max(0, sequence.findIndex(view => view.id === state.deck.slides[index]?.id && view.name === name));
  const columns = sequence.length > 20 ? 5 : 4;
  const gapX = cell.width + 90,
    gapY = cell.height + 110;
  return {
    x: (index % columns) * gapX - ((columns - 1) * gapX) / 2 - size.width / 2,
    y:
      Math.floor(index / columns) * gapY -
      ((Math.ceil(sequence.length / columns) - 1) * gapY) / 2 -
      size.height / 2,
  };
}
function renderFrames() {
  diagram?.reset();
  cancelPageTransition();
  stopTitleEffect();
  lastTitleFrame = null;
  els.world.innerHTML = "";
  viewSequence().forEach(view => {
    const slide = getSlide(view.id);
    const index = state.deck.slides.indexOf(slide);
    const frame = document.createElement("article");
    frame.className = "slide-frame";
    frame.dataset.slideId = slide.id;
    frame.dataset.frameKey = frameKey(slide.id, view.name);
    if (view.name) frame.dataset.boardName = view.name;
    frame.classList.toggle("whiteboard-surface", !!view.name);
    frame.classList.toggle("blackboard-surface", !!view.name && boardInfo(slide.id, view.name).color === "black");
    const p = framePosition(index, view.name);
    frame.style.width = `${slide.width}px`;
    frame.style.height = `${slide.height}px`;
    frame.style.left = `${p.x}px`;
    frame.style.top = `${p.y}px`;
    const image = document.createElement("img");
    image.alt = `${slide.id}: ${slide.title}`;
    image.loading = index < 3 ? "eager" : "lazy";
    image.src = assetUrl(slide.asset.startsWith("public/")
      ? slide.asset
      : `public/deck/${slide.asset}`);
    image.addEventListener("error", () => {
      image.remove();
      const fallback = document.createElement("div");
      fallback.className = "slide-fallback";
      fallback.innerHTML = `<div><span class="slide-number">${escapeHtml(slide.id)}</span><h2>${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.summary || "Slide image will appear when the deck export is ready.")}</p></div><div class="fallback-rule"></div>`;
      frame.prepend(fallback);
    });
    if (!view.name) frame.append(image);
    const label = document.createElement("span");
    label.className = "frame-label";
    label.textContent = view.name ? `${slide.id} + ${view.name}` : `${slide.id} · ${slide.title}`;
    frame.append(label);
    const canvas = document.createElement("canvas");
    canvas.className = "annotation-canvas";
    canvas.width = Math.ceil(slide.width);
    canvas.height = Math.ceil(slide.height);
    canvas.dataset.slideId = slide.id;
    if (view.name) canvas.dataset.boardName = view.name;
    frame.append(canvas);
    if (!view.name && slide.links?.length)
      slide.links.forEach((link) => {
        const a = document.createElement("button");
        a.type = "button";
        a.className = "slide-link generated-link";
        a.setAttribute(
          "aria-label",
          link.page ? `Go to page ${link.page}` : link.resource ? "Open bundled resource" : link.local ? "Local resource was not bundled" : "Open link",
        );
        a.title = a.getAttribute("aria-label");
        a.dataset.unavailable = String(!!link.local);
        a.style.left = `${link.x || 0}px`;
        a.style.top = `${link.y || 0}px`;
        a.style.width = `${link.width || 80}px`;
        a.style.height = `${link.height || 20}px`;
        a.addEventListener("click", (e) => {
          e.stopPropagation();
          if (
            state.tool !== "navigate" ||
            state.whiteboard ||
            slide.id !== state.currentId
          )
            return;
          if (link.local) return;
          if (link.page) { const target = state.deck.slides.find(s => s.page === link.page); if (target) navigateTo(target.id, {detour:true}); }
          else if (link.resource) openResource(link.resource);
          else if (/^(https?:|mailto:)/i.test(link.href)) window.open(link.href, "_blank", "noopener");
        });
        frame.append(a);
      });
    frame.addEventListener("click", () => {
      if (state.tool === "navigate" && !suppressSpace)
        navigateTo(slide.id, {
          boardName: view.name,
          detour: slide.id !== state.deck.route[routeCursor],
        });
    });
    bindCanvas(canvas);
    els.world.append(frame);
    drawSurface(slide.id);
  });
}
function escapeHtml(text) {
  return String(text).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
}

function updateCamera() {
  if (pageTransitions.active) {
    cancelPageTransition();
    syncTitleEffect(true);
  }
  hideWand();
  els.world.style.transform = `translate(${state.camera.x}px,${state.camera.y}px) scale(${state.camera.scale})`;
  els.zoom.textContent = `${Math.round(state.camera.scale * 100)}%`;
  diagram?.renderSelection();
}
function fitCurrent(animate = true) {
  diagram?.finish();
  if (state.currentStroke?.sticky) finishActiveStroke();
  if (state.currentStroke || !state.deck.slides.length) return;
  state.autoFit = true;
  const rect = els.stage.getBoundingClientRect();
  const {width, height} = slideSize();
  const scale = state.presentation
    ? Math.min(rect.width / width, rect.height / height)
    : clamp(Math.min(rect.width / (width + 120), rect.height / (height + 130)), 0.03, 1.25);
  const index = state.deck.slides.findIndex((s) => s.id === state.currentId);
  const p = framePosition(Math.max(0, index), state.whiteboard ? boardName : null);
  state.camera = { scale, x: -(p.x + width / 2) * scale, y: -(p.y + height / 2) * scale };
  clearTimeout(cameraTransitionTimer);
  els.world.style.transition =
    animate && !state.reducedMotion
      ? "transform .38s cubic-bezier(.2,.8,.2,1)"
      : "none";
  updateCamera();
  cameraTransitionTimer = window.setTimeout(() => {
    els.world.style.transition = "";
  }, 430);
}
function fitWhole() {
  diagram?.finish();
  if (state.currentStroke?.sticky) finishActiveStroke();
  if (state.currentStroke || !state.deck.slides.length) return;
  const rect = els.stage.getBoundingClientRect();
  const count = viewSequence().length;
  const cols = count > 20 ? 5 : 4;
  const rows = Math.ceil(count / cols);
  const cell = layoutSize();
  const width = (cols - 1) * (cell.width + 90) + cell.width;
  const height = (rows - 1) * (cell.height + 110) + cell.height;
  state.camera = {
    scale: clamp(
      Math.min(rect.width / (width + 150), rect.height / (height + 150)),
      0.1,
      1,
    ),
    x: 0,
    y: 0,
  };
  state.autoFit = false;
  updateCamera();
  persist();
}
function zoomAt(factor, clientX, clientY) {
  diagram?.finish();
  if (state.currentStroke?.sticky) finishActiveStroke();
  if (state.currentStroke) return;
  state.autoFit = false;
  hideWand();
  const center = els.stage.getBoundingClientRect();
  clientX ??= center.left + center.width / 2;
  clientY ??= center.top + center.height / 2;
  const rect = els.stage.getBoundingClientRect();
  const before = {
    x:
      (clientX - rect.left - rect.width / 2 - state.camera.x) /
      state.camera.scale,
    y:
      (clientY - rect.top - rect.height / 2 - state.camera.y) /
      state.camera.scale,
  };
  const nextScale = clamp(state.camera.scale * factor, 0.03, 32);
  state.camera.x = clientX - rect.left - rect.width / 2 - before.x * nextScale;
  state.camera.y = clientY - rect.top - rect.height / 2 - before.y * nextScale;
  state.camera.scale = nextScale;
  updateCamera();
  persist();
}

function updateUI() {
  const slide = getSlide();
  if (!slide) return;
  const routeIndex = routeCursor;
  state.currentIndex = state.deck.slides.findIndex(
    (s) => s.id === state.currentId,
  );
  $$(".slide-frame").forEach(frame => {
    const active = frame.dataset.frameKey === activeFrameKey();
    frame.classList.toggle("current", active);
    frame.classList.toggle("visited", state.visited.has(frame.dataset.slideId));
    frame.querySelectorAll(".generated-link").forEach(link => {
      link.disabled = state.tool !== "navigate" || !active || !!frame.dataset.boardName || link.dataset.unavailable === "true";
      link.tabIndex = link.disabled ? -1 : 0;
    });
    frame.querySelector(".annotation-canvas").style.pointerEvents =
      ["pen", "highlighter", "eraser", "diagram"].includes(state.tool) && active ? "auto" : "none";
  });
  state.deck.slides.forEach(slide => drawSurface(slide.id));
  const info = boardInfo();
  els.position.textContent = state.whiteboard
    ? `${state.currentId} + ${boardName} · ${info.kept ? "Kept" : "Draft"}`
    : `${slide.id} · ${slide.navigationLabel || slide.title}`;
  const sequence = viewSequence();
  const position = sequence.findIndex(view => frameKey(view.id, view.name) === activeFrameKey());
  els.routeText.textContent = `${String(position + 1).padStart(2, "0")} / ${sequence.length}`;
  els.routeProgress.style.width = `${((position + 1) / sequence.length) * 100}%`;
  els.detour.hidden = !state.detourReturn;
  $("#whiteboardButton").classList.toggle("active", state.whiteboard);
  $("#boardControls").hidden = !state.whiteboard;
  $("#keepBoardButton").textContent = info.kept ? "Kept ✓" : "Keep board";
  $("#keepBoardButton").setAttribute("aria-pressed", String(info.kept));
  els.app.classList.toggle(
    "drawing-mode",
    ["pen", "highlighter", "eraser"].includes(state.tool),
  );
  els.stage.classList.toggle("wand-mode", state.tool === "wand");
  els.stage.classList.toggle("laser-mode", state.tool === "laser");
  els.app.classList.toggle("diagram-mode", state.tool === "diagram");
  diagram?.sync();
  els.app.classList.toggle("presentation-mode", state.presentation);
  updateCamera();
  syncTitleEffect();
}
function addHistory(id) {
  const entry = {
    id,
    camera: { ...state.camera },
    board: state.whiteboard,
    boardName,
    boardReturnCamera: boardReturnCamera ? { ...boardReturnCamera } : null,
    detourReturn: state.detourReturn
      ? structuredClone(state.detourReturn)
      : null,
    routeCursor,
  };
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(entry);
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 60) {
    state.history.shift();
    state.historyIndex--;
  }
}
function navigateTo(id, options = {}) {
  const target = state.deck.slides.find((s) => s.id === id);
  if (!target) return;
  diagram?.reset();
  finishActiveStroke();
  if (state.overview) closeOverview();
  if (els.concept.open) els.concept.close();
  const old = state.currentId;
  recordHistoryView();
  const targetName = options.boardName || null;
  if (old === id && targetName === (state.whiteboard ? boardName : null) && !options.force) {
    if (state.overview) closeOverview();
    return;
  }
  cancelPageTransition();
  const sequence = viewSequence();
  const oldPosition = sequence.findIndex(view => frameKey(view.id, view.name) === activeFrameKey());
  const newPosition = sequence.findIndex(view => frameKey(view.id, view.name) === frameKey(id, targetName));
  const direction = options.direction || Math.sign(newPosition - oldPosition) || 1;
  const changed = old !== id || targetName !== (state.whiteboard ? boardName : null);
  const snapshot = changed && !state.reducedMotion && !["camera", "none"].includes(state.slideTransition)
    ? PigeonTransitions.capture({stage: els.stage, frame: $(".slide-frame.current"),
        asset: state.whiteboard ? null : assetUrl(deckAsset(getSlide().asset)),
        color: state.whiteboard && boardInfo().color === "black" ? "#111827" : "white"})
    : null;
  pageTransitionPending = !!snapshot;
  const transitionRequest = pageTransitionRequest;
  finishActiveStroke();
  if (options.detour && !state.detourReturn)
    state.detourReturn = {
      id: old,
      camera: { ...state.camera },
      routeIndex: routeCursor,
      boardName: state.whiteboard ? boardName : null,
    };
  if (!options.detour && !state.detourReturn)
    routeCursor = Math.max(0, state.deck.route.indexOf(id));
  if (targetName) boardReturnCamera = old === id && !state.whiteboard ? {...state.camera} : parentCameraFor(id);
  state.currentId = id;
  state.visited.add(id);
  state.whiteboard = !!targetName;
  if (targetName) boardName = targetName;
  hideWand();
  state.currentIndex = state.deck.slides.findIndex((s) => s.id === id);
  state.deck.slides.forEach((s) => drawSurface(s.id));
  fitCurrent(state.slideTransition === "camera");
  addHistory(id);
  updateUI();
  if (snapshot) pageTransitions.play(snapshot, $(".slide-frame.current"), {
    name: state.slideTransition, direction,
    onComplete() {
      if (transitionRequest !== pageTransitionRequest) return;
      pageTransitionPending = false;
      syncTitleEffect(true);
    },
  });
  renderOverview();
  persist();
}
function nextSlide(direction = 1) {
  finishActiveStroke();
  const sequence = viewSequence();
  const current = sequence.findIndex(view => frameKey(view.id, view.name) === activeFrameKey());
  const target = sequence[clamp(current + direction, 0, sequence.length - 1)];
  if (target) navigateTo(target.id, {force: true, boardName: target.name, direction});
}
function resumeRoute() {
  if (!state.detourReturn) { toast("Already on the planned talk · no detour to resume"); return; }
  finishActiveStroke();
  recordHistoryView();
  if (state.overview) closeOverview();
  const target = state.detourReturn;
  state.detourReturn = null;
  routeCursor = target.routeIndex;
  state.currentId = target.id;
  state.currentIndex = state.deck.slides.findIndex((s) => s.id === target.id);
  state.whiteboard = !!target.boardName;
  if (target.boardName) { boardName = target.boardName; boardReturnCamera = parentCameraFor(target.id); }
  state.camera = { ...target.camera };
  addHistory(target.id);
  updateUI();
  toast(`Resumed at ${target.id}`);
  persist();
}
function continueFromHere() {
  const index = state.deck.route.indexOf(state.currentId);
  if (index >= 0) {
    routeCursor = index;
    state.detourReturn = null;
  }
  updateUI();
  toast("The talk will continue from this slide");
  persist();
}
function historyMove(direction) {
  diagram?.reset();
  finishActiveStroke();
  recordHistoryView();
  const next = clamp(
    state.historyIndex + direction,
    0,
    state.history.length - 1,
  );
  if (!state.history[next]) return;
  state.historyIndex = next;
  const entry = state.history[next];
  state.currentId = entry.id;
  state.currentIndex = state.deck.slides.findIndex((slide) => slide.id === entry.id);
  state.whiteboard = entry.board && state.boardMeta[`${entry.id}::${entry.boardName}`]?.inserted !== false;
  boardName = entry.boardName || "Main";
  boardReturnCamera = entry.boardReturnCamera
    ? { ...entry.boardReturnCamera }
    : null;
  state.detourReturn = entry.detourReturn
    ? structuredClone(entry.detourReturn)
    : null;
  routeCursor = entry.routeCursor;
  state.camera = { ...entry.camera };
  state.deck.slides.forEach((s) => drawSurface(s.id));
  updateUI();
  persist();
}

function drawSurface(id) {
  for (const canvas of $$(`canvas[data-slide-id="${CSS.escape(id)}"]`)) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ops = canvas.dataset.boardName
      ? state.boards[`${id}::${canvas.dataset.boardName}`] || []
      : state.annotations[id] || [];
    ops.forEach(op => drawOperation(ctx, op, ops));
  }
}
function drawOperation(ctx, op, ops = surfaceOps()) {
  if (op.type === "diagram") {
    PigeonDiagram.draw(ctx, op, ops);
  } else if (op.type === "stroke") {
    if (!op.points.length) return;
    ctx.save();
    ctx.globalAlpha = op.opacity ?? 1;
    ctx.strokeStyle = op.color;
    ctx.lineWidth =
      op.width *
      (op.tool === "pen" && op.points.some((p) => p.pressure)
        ? clamp(
            (op.points.reduce((sum, p) => sum + (p.pressure ?? 0.5), 0) /
              op.points.length) *
              2,
            0.4,
            1.8,
          )
        : 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    op.points.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.stroke();
    if (op.points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        op.points[0].x,
        op.points[0].y,
        ctx.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = op.color;
      ctx.fill();
    }
    ctx.restore();
  } else if (op.type === "rect") {
    ctx.save();
    ctx.globalAlpha = op.opacity ?? 0.35;
    ctx.fillStyle = op.color;
    ctx.fillRect(op.x, op.y, op.w, op.h);
    ctx.restore();
  }
}
function canvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const {width, height} = slideSize(canvas.dataset?.slideId);
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * width, 0, width),
    y: clamp(((event.clientY - rect.top) / rect.height) * height, 0, height),
    pressure: event.pointerType === "pen" ? event.pressure || 0.5 : 0.5,
  };
}
function boardKey(id = state.currentId) {
  return `${id}::${boardName}`;
}
function surfaceKey(id = state.currentId) {
  return state.whiteboard ? `board:${boardKey(id)}` : `slide:${id}`;
}
function surfaceOps(id = state.currentId) {
  return state.whiteboard
    ? (state.boards[boardKey(id)] ||= [])
    : (state.annotations[id] ||= []);
}
function setSurface(ops, id = state.currentId) {
  if (state.whiteboard) state.boards[boardKey(id)] = ops;
  else state.annotations[id] = ops;
}
function checkpoint(id = state.currentId) {
  const key = surfaceKey(id);
  (undoStacks[key] ||= []).push(structuredClone(surfaceOps(id)));
  if (undoStacks[key].length > 80) undoStacks[key].shift();
  redoStacks[key] = [];
}
function finishActiveStroke(event) {
  const active = state.currentStroke;
  if (
    !active ||
    (event?.pointerId !== undefined && active.pointerId !== event.pointerId)
  )
    return;
  state.currentStroke = null;
  const { surface, pointerId, sticky, ...operation } = active;
  if (surface.startsWith("board:"))
    (state.boards[surface.slice(6)] ||= []).push(operation);
  else (state.annotations[surface.slice(6)] ||= []).push(operation);
  drawSurface(active.id);
  persist();
}

function bindCanvas(canvas) {
  const canDraw = () => canvas.closest(".slide-frame").dataset.frameKey === activeFrameKey()
    && !spaceDown && !state.overview && !state.blackout && !document.querySelector("dialog[open]");
  const startStroke = (event, sticky = false) => {
    cancelPageTransition();
    clearTimeout(cameraTransitionTimer);
    els.world.style.transition = "none";
    checkpoint(canvas.dataset.slideId);
    state.currentStroke = {
      surface: surfaceKey(canvas.dataset.slideId), pointerId: event.pointerId,
      id: canvas.dataset.slideId, type: "stroke", tool: state.tool, sticky,
      color: state.color, width: state.tool === "highlighter" ? 22 : 3.7,
      opacity: state.tool === "highlighter" ? 0.28 : 1,
      points: [canvasPoint(event, canvas)],
    };
    drawOperation(canvas.getContext("2d"), state.currentStroke);
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (diagram?.down(event, canvas)) return;
    if (
      canvas.closest(".slide-frame").dataset.frameKey !== activeFrameKey() ||
      !["pen", "highlighter", "eraser"].includes(state.tool) ||
      !canDraw() || event.button !== 0
    )
      return;
    event.preventDefault();
    if (state.stickyPen && state.tool === "pen") {
      if (!state.currentStroke) startStroke(event, true);
      return;
    }
    if (state.currentStroke) finishActiveStroke();
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(event, canvas);
    if (state.tool === "eraser") {
      eraseAt(canvas.dataset.slideId, point);
      return;
    }
    startStroke(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (diagram?.move(event, canvas)) return;
    if (state.stickyPen && state.tool === "pen") {
      if (!canDraw()) { finishActiveStroke(); return; }
      if (pageTransitions.active) return;
      if (!state.currentStroke) { startStroke(event, true); return; }
    }
    if (
      state.tool === "eraser" &&
      !spaceDown &&
      event.buttons &&
      canvas.closest(".slide-frame").dataset.frameKey === activeFrameKey()
    ) {
      eraseAt(canvas.dataset.slideId, canvasPoint(event, canvas));
      return;
    }
    if (
      !state.currentStroke ||
      state.currentStroke.id !== canvas.dataset.slideId ||
      state.currentStroke.pointerId !== event.pointerId
    )
      return;
    event.preventDefault();
    state.currentStroke.points.push(canvasPoint(event, canvas));
    drawSurface(canvas.dataset.slideId);
    drawOperation(canvas.getContext("2d"), state.currentStroke);
  });
  canvas.addEventListener("pointerup", event => {
    diagram?.finish();
    if (!state.currentStroke?.sticky) finishActiveStroke(event);
  });
  canvas.addEventListener("pointercancel", event => { diagram?.cancel(); finishActiveStroke(event); });
  canvas.addEventListener("dblclick", event => diagram?.doubleClick(event, canvas));
  canvas.addEventListener("lostpointercapture", event => {
    diagram?.finish();
    if (!state.currentStroke?.sticky) finishActiveStroke(event);
  });
  canvas.addEventListener("pointerleave", event => {
    if (state.currentStroke?.sticky) finishActiveStroke(event);
  });
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = clamp(
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function eraseAt(id, point) {
  const target = surfaceOps(id);
  const keep = target.filter(
    (op) =>
      !op.points?.some(
        (p, i) =>
          segmentDistance(point, p, op.points[i + 1] || p) < 20 + op.width / 2,
      ),
  );
  if (keep.length !== target.length) {
    checkpoint(id);
    setSurface(keep, id);
    drawSurface(id);
    persist();
  }
}
function clearSurface() {
  diagram?.reset();
  finishActiveStroke();
  checkpoint();
  setSurface([]);
  drawSurface(state.currentId);
  persist();
  toast("Current surface cleared · Cmd/Ctrl+Z to undo");
}
function undo() {
  finishActiveStroke();
  const key = surfaceKey();
  if (undoStacks[key]?.length) {
    (redoStacks[key] ||= []).push(structuredClone(surfaceOps()));
    setSurface(undoStacks[key].pop());
    drawSurface(state.currentId);
    persist();
  }
  diagram?.sync();
}
function redo() {
  const key = surfaceKey();
  if (redoStacks[key]?.length) {
    (undoStacks[key] ||= []).push(structuredClone(surfaceOps()));
    setSurface(redoStacks[key].pop());
    drawSurface(state.currentId);
    persist();
  }
  diagram?.sync();
}

function toggleTool(tool) { setTool(state.tool === tool ? "navigate" : tool); }
function setStickyPen(enabled) {
  finishActiveStroke();
  state.stickyPen = !!enabled && state.tool === "pen";
  $("#penDownIndicator").hidden = !state.stickyPen;
}
function toggleStickyPen() {
  if (state.tool !== "pen") { toast("Select Pen (P), then press ` for Pen down mode"); return; }
  setStickyPen(!state.stickyPen);
}
function setTool(tool) {
  if (state.tool === "diagram" && tool !== "diagram") diagram?.reset();
  finishActiveStroke();
  if (tool !== "pen") setStickyPen(false);
  hideWand();
  window.clearTimeout(showLaser.timeout);
  if (tool !== "laser") els.laser.classList.remove("on");
  state.tool = tool;
  $$(".tool-button[data-tool]").forEach((button) =>
    button.classList.toggle("active", button.dataset.tool === tool),
  );
  updateUI();
  if (tool === "laser") showLaser();
  persist();
}
function setColor(color) {
  finishActiveStroke();
  state.color = color;
  $$(".swatch").forEach((s) =>
    s.classList.toggle("active", s.dataset.color === color),
  );
  persist();
}
function showLaser(event) {
  if (event) showLaser.pointer = {x: event.clientX, y: event.clientY};
  if (state.tool !== "laser") return;
  const pointer = showLaser.pointer || (() => {
    const rect = els.stage.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  })();
  els.laser.style.left = `${pointer.x}px`;
  els.laser.style.top = `${pointer.y}px`;
  els.laser.classList.add("on");
}

function hideWand() {
  $$(".wand-highlight, .wand-shade").forEach(node => node.remove());
}
function showWand(event) {
  if (state.tool !== "wand" || state.whiteboard || state.overview) { hideWand(); return; }
  const frame = $(".slide-frame.current");
  if (!frame) return;
  const bounds = frame.getBoundingClientRect();
  const {width, height} = slideSize();
  const x = (event.clientX - bounds.left) * width / bounds.width;
  const y = (event.clientY - bounds.top) * height / bounds.height;
  const region = (getSlide().wandRegions || getSlide().textRegions || [])
    .filter(region => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height)
    .sort((a, b) => {
      const priority = {takeaway: 4, table: 3, image: 2, text: 1};
      // A scanned page or background image must not hide its OCR text targets.
      const rank = r => r.kind === "image" && r.width * r.height > width * height * .8
        ? 0 : priority[r.kind || "text"];
      return (rank(b) - rank(a)) ||
        (a.width * a.height - b.width * b.height);
    })[0];
  if (!region) { hideWand(); return; }
  const current = frame.querySelector(".wand-highlight");
  if (current?.dataset.region === region.id) return;
  hideWand();
  if (region.kind === "takeaway") {
    const shade = document.createElement("div");
    shade.className = "wand-shade";
    shade.setAttribute("aria-hidden", "true");
    frame.append(shade);
  }
  const highlight = document.createElement("div");
  highlight.className = "wand-highlight";
  highlight.dataset.region = region.id;
  highlight.dataset.kind = region.kind || "text";
  highlight.setAttribute("aria-hidden", "true");
  const pad = 6, left = Math.max(0, region.x - pad), top = Math.max(0, region.y - pad);
  Object.assign(highlight.style, {
    left: `${left}px`, top: `${top}px`,
    width: `${Math.min(width, region.x + region.width + pad) - left}px`,
    height: `${Math.min(height, region.y + region.height + pad) - top}px`,
    backgroundImage: `url("${assetUrl(deckAsset(getSlide().asset))}")`,
    backgroundSize: `${width}px ${height}px`, backgroundPosition: `${-left}px ${-top}px`,
    animation: state.reducedMotion ? "none" :
      region.kind === "takeaway" ? "wand-takeaway 320ms cubic-bezier(.2,.9,.2,1) both" :
      "wand-pop 180ms ease-out both",
  });
  frame.append(highlight);
}

function renderOverview() {
  if (state.mode === "graph" && !state.graphError) renderGraph();
  else renderHierarchy();
}
function renderHierarchy() {
  state.hierarchyFocus ||= activeFrameKey();
  const sections = state.deck.sections?.length
    ? state.deck.sections
    : buildSections(state.deck.slides);
  const html = `${state.graphError ? `<p class="graph-error" role="alert">Knowledge graph unavailable: ${escapeHtml(state.graphError)}</p>` : ""}<div class="hierarchy"><div class="hierarchy-main">${sections
    .map(
      (section, i) =>
        `<section class="section-block"><div class="section-head"><span class="section-index">${String(i + 1).padStart(2, "0")}</span><span>${escapeHtml(section.label)}</span><span class="section-line"></span><span>${section.slides.length}</span></div>${section.summary ? `<p class="section-summary">${escapeHtml(section.summary)}</p>` : ""}<div class="slide-list">${section.slides
          .map((id) => {
            const slide = getSlide(id);
            if (!slide) return "";
            return viewSequence().filter(view => view.id === id).map(view => {
              const key = frameKey(id, view.name);
              return `<button class="slide-tile ${key === activeFrameKey() ? "current" : ""} ${key === state.hierarchyFocus ? "selected" : ""}" data-jump="${escapeHtml(id)}" data-frame-key="${escapeHtml(key)}" ${view.name ? `data-board-name="${escapeHtml(view.name)}"` : ""} type="button"><span class="tile-id">${escapeHtml(id)}${view.name ? " +" : ""}</span><span class="tile-title">${escapeHtml(view.name ? `${view.name} · ${boardInfo(id, view.name).kept ? "Kept" : "Draft"}` : slide.navigationLabel || slide.title)}</span></button>`;
            }).join("");
          })
          .join("")}</div></section>`,
    )
    .join(
      "",
    )}</div><aside class="overview-aside"><h3>Current position</h3><p>${escapeHtml(getSlide().title)}<br><span class="route-chip">${state.detourReturn ? `Exploring · resume ${state.detourReturn.id}` : `Route ${state.currentIndex + 1} of ${state.deck.route.length}`}</span></p><h3>Keyboard</h3><p><kbd>↑</kbd> <kbd>↓</kbd> move through slides<br><kbd>Enter</kbd> open a slide<br><kbd>T</kbd> switch to the knowledge graph</p><h3>Graph coverage</h3><p>${state.graph.concepts.length} concepts · ${state.graph.relationships.length} relationships<br>${state.graphError ? escapeHtml(state.graphError) : "All concepts link to their source evidence."}</p></aside></div>`;
  els.overviewContent.innerHTML = html;
  $$(".slide-tile", els.overviewContent).forEach(button => button.addEventListener("focus", () => {
    state.hierarchyFocus = button.dataset.frameKey;
    $$(".slide-tile", els.overviewContent).forEach(tile => tile.classList.toggle("selected", tile === button));
  }));
  $$(".slide-tile", els.overviewContent).forEach((button) =>
    button.addEventListener("click", () => {
      closeOverview();
      navigateTo(button.dataset.jump, { detour: true, boardName: button.dataset.boardName || null });
    }),
  );
}
function graphEdgePath(source, target) {
  const dx = target.x - source.x,
    dy = target.y - source.y,
    length = Math.hypot(dx, dy) || 1;
  // Clip to the compact concept cards, keeping arrowheads outside the text.
  const border = Math.min(44 * length / Math.abs(dx), 24 * length / Math.abs(dy));
  const start = border + 1,
    end = border + 4;
  return {
    x1: source.x + (dx / length) * start,
    y1: source.y + (dy / length) * start,
    x2: target.x - (dx / length) * end,
    y2: target.y - (dy / length) * end,
  };
}
function graphNodeElement(id) {
  return $$(".graph-node", els.overviewContent).find(
    (node) => node.dataset.concept === id,
  );
}
function graphLabel(label) {
  const lines = [];
  for (const word of label.split(/\s+/)) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + word.length + 1 <= 16)
      lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines.slice(0, 4).map((line, index, visible) =>
    `<tspan x="0" y="${(index - (visible.length - 1) / 2) * 11 + 3.5}">${escapeHtml(index === 3 && lines.length > 4 ? line + "…" : line)}</tspan>`
  ).join("");
}
function renderGraph() {
  if (state.graphError) {
    els.overviewContent.innerHTML = `<p role="alert">${escapeHtml(state.graphError)}</p>`;
    return;
  }
  const nodes = state.graph.concepts,
    byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(state.graphFocus))
    state.graphFocus =
      nodes.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0))[0]
        ?.id || null;
  const clusters = [
    ...new Map(
      nodes.map((node) => [node.cluster, node.clusterBounds]),
    ).values(),
  ];
  els.overviewContent.innerHTML = `<div class="graph-view"><div class="graph-canvas-wrap"><svg class="graph-canvas" viewBox="0 0 1000 740" role="group" aria-label="Knowledge graph. Arrow keys change concepts; Enter opens evidence."><defs><marker id="arrow" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto"><path d="M0,0 L0,4 L4,2 z" fill="#8c99b3"></path></marker></defs>
    ${clusters.map((cluster) => `<g class="graph-cluster"><rect x="${cluster.x}" y="${cluster.y}" width="${cluster.width}" height="${cluster.height}" rx="15"></rect><text x="${cluster.x + 14}" y="${cluster.y + 20}">${escapeHtml(cluster.label)}</text></g>`).join("")}
    ${state.graph.relationships
      .map((edge, index) => {
        const start = byId.get(edge.source),
          end = byId.get(edge.target),
          line = graphEdgePath(start, end);
        return `<g class="graph-edge" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}"><line class="${/propos/i.test(edge.status || "") ? "proposal" : ""}" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" marker-end="url(#arrow)"></line><text class="edge-label" x="${(start.x + end.x) / 2}" y="${(start.y + end.y) / 2 - 5}" text-anchor="middle">${index + 1}</text><title>${escapeHtml(start.label + " — " + edge.predicate + " → " + end.label)}</title></g>`;
      })
      .join("")}
    ${nodes.map((node) => `<g class="graph-node ${(node.slides || []).includes(state.currentId) ? "current-concept" : ""}" data-concept="${escapeHtml(node.id)}" tabindex="${node.id === state.graphFocus ? 0 : -1}" role="button" aria-label="${escapeHtml(node.label)}"><title>${escapeHtml(node.label)}</title><rect class="node-shape" x="${node.x - 44}" y="${node.y - 24}" width="88" height="48" rx="8"></rect><text transform="translate(${node.x} ${node.y})" text-anchor="middle">${graphLabel(node.label)}</text></g>`).join("")}
    </svg><div class="graph-canvas-hint">Arrows select · Enter opens evidence · Edge numbers match the relationship list</div></div><aside class="graph-details" id="graphDetails" aria-label="Focused concept evidence"></aside></div>`;
  for (const node of $$(".graph-node", els.overviewContent)) {
    node.addEventListener("click", () => focusConcept(node.dataset.concept));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        focusConcept(node.dataset.concept, false);
        openConceptModal(node.dataset.concept);
      }
    });
  }
  focusConcept(state.graphFocus, false);
}
function evidenceMarkup(evidence) {
  return (evidence || [])
    .map(
      (item) =>
        `<button class="evidence-link" type="button" data-jump="${escapeHtml(item.slideId)}"><strong>${escapeHtml(item.slideId)} · ${escapeHtml(getSlide(item.slideId)?.title || "")}</strong><q>${escapeHtml(item.evidence || item.text || "")}</q>${item.kind === "visual" ? "<small>Visual evidence</small>" : ""}</button>`,
    )
    .join("");
}
function relationshipMarkup(concept) {
  return (
    state.graph.relationships
      .filter(
        (edge) => edge.source === concept.id || edge.target === concept.id,
      )
      .map((edge) => {
        const otherId = edge.source === concept.id ? edge.target : edge.source;
        const other = state.graph.concepts.find((node) => node.id === otherId);
        const qualification =
          typeof edge.qualification === "object"
            ? JSON.stringify(edge.qualification)
            : edge.qualification || edge.qualifier || "";
        return `<section class="relationship-card"><button class="evidence-link relationship-target" type="button" data-concept="${escapeHtml(otherId)}"><span class="relationship-number">${state.graph.relationships.indexOf(edge) + 1}</span> ${edge.source === concept.id ? "→" : "←"} ${escapeHtml(edge.predicate)} · ${escapeHtml(other?.label || "")}</button><p class="claim-status">${escapeHtml(edge.status || "source assertion")}${qualification ? " · " + escapeHtml(qualification) : ""}${edge.negated ? " · negated" : ""}</p>${evidenceMarkup(edge.evidence)}</section>`;
      })
      .join("") || "<p>No connected relationships recorded.</p>"
  );
}
function bindEvidenceLinks(root) {
  $$("[data-jump]", root).forEach((button) =>
    button.addEventListener("click", () =>
      navigateTo(button.dataset.jump, { detour: true }),
    ),
  );
  $$("[data-concept]", root).forEach((button) =>
    button.addEventListener("click", () => {
      if (els.concept.open) openConceptModal(button.dataset.concept);
      else focusConcept(button.dataset.concept);
    }),
  );
}
function focusConcept(id, moveFocus = true) {
  const concept = state.graph.concepts.find((node) => node.id === id);
  if (!concept) return;
  state.graphFocus = id;
  const neighborhood = new Set([
    id,
    ...state.graph.relationships
      .filter((edge) => edge.source === id || edge.target === id)
      .flatMap((edge) => [edge.source, edge.target]),
  ]);
  $$(".graph-node", els.overviewContent).forEach((node) => {
    node.classList.toggle("focused", node.dataset.concept === id);
    node.classList.toggle("dimmed", !neighborhood.has(node.dataset.concept));
    node.setAttribute("tabindex", node.dataset.concept === id ? "0" : "-1");
  });
  $$(".graph-edge", els.overviewContent).forEach((edge) => {
    const focused = edge.dataset.source === id || edge.dataset.target === id;
    edge.classList.toggle("focused", focused);
    edge.classList.toggle("dimmed", !focused);
  });
  const details = $("#graphDetails", els.overviewContent);
  if (details) {
    details.innerHTML = `<button class="concept-open" type="button">Open evidence details ↗</button><h3>${escapeHtml(concept.label)}</h3><p>${escapeHtml(concept.description || "")}</p><div>${(concept.aliases || []).map((alias) => `<span class="concept-tag">${escapeHtml(alias)}</span>`).join("")}</div><h4 class="evidence-title">Original mentions</h4>${evidenceMarkup(concept.mentions)}<h4 class="evidence-title">Relationships</h4>${relationshipMarkup(concept)}`;
    $(".concept-open", details).addEventListener("click", () =>
      openConceptModal(id),
    );
    bindEvidenceLinks(details);
  }
  if (moveFocus) graphNodeElement(id)?.focus();
  persist();
}

function openOverview() {
  diagram?.reset();
  cancelPageTransition();
  syncTitleEffect();
  finishActiveStroke();
  if (!state.overview) state.hierarchyFocus = activeFrameKey();
  state.overview = true;
  diagram?.sync();
  if (state.mode === "graph" && state.graphError) state.mode = "hierarchy";
  els.overview.classList.add("open");
  els.overview.setAttribute("aria-hidden", "false");
  document.body.classList.add("overview-mode");
  renderOverview();
  focusOverviewSurface();
  persist();
}
function closeOverview() {
  state.overview = false;
  diagram?.sync();
  els.overview.classList.remove("open");
  els.overview.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overview-mode");
  $("#stage").focus();
  persist();
}
function openSearch(initial = "") {
  finishActiveStroke();
  els.search.showModal();
  els.searchInput.value = initial;
  updateSearch(initial);
  window.setTimeout(() => els.searchInput.focus(), 20);
}
function parseSearch(query) {
  const q = query.trim();
  if (!q) return [];
  const exactInput = q.replace(/^#/, "");
  const exact = /^\d+[a-z]?$/i.test(exactInput)
    ? exactInput.replace(
        /^0*(\d+)([a-z]?)$/i,
        (_, digits, suffix) => digits.padStart(2, "0") + suffix,
      )
    : exactInput;
  const physical = /^p(\d+)$/i.exec(q);
  const slides = state.deck.slides;
  const results = [];
  if (physical) {
    const hit = slides.find((s) => s.page === Number(physical[1]));
    if (hit)
      results.push({
        type: "slide",
        id: hit.id,
        title: hit.title,
        snippet: `Physical page ${hit.page} · source label ${hit.id}`,
      });
  } else if (/^#?[0-9]{1,3}[a-z]?$/i.test(q)) {
    const hit = slides.find((s) => s.id.toLowerCase() === exact.toLowerCase());
    if (hit)
      results.push({
        type: "slide",
        id: hit.id,
        title: hit.title,
        snippet: `Exact source label · physical page ${hit.page}`,
      });
    slides
      .filter((s) => String(s.page) === exactInput && (!hit || s.id !== hit.id))
      .forEach((s) =>
        results.push({
          type: "slide",
          id: s.id,
          title: s.title,
          snippet: `Physical page ${s.page} · source label ${s.id}`,
        }),
      );
  }
  const needle = q.toLocaleLowerCase();
  slides.forEach((s) => {
    const hay = `${s.id} ${s.title} ${s.section} ${s.text}`.toLocaleLowerCase();
    if (
      hay.includes(needle) &&
      !results.some((r) => r.id === s.id && r.type === "slide")
    ) {
      const at = hay.indexOf(needle);
      results.push({
        type: "slide",
        id: s.id,
        title: s.title,
        snippet: `${s.section} · ${s.text.slice(Math.max(0, at - 22), at + 95)}`,
      });
    }
  });
  state.graph.concepts.forEach((n) => {
    const hay =
      `${n.label} ${(n.aliases || []).join(" ")} ${n.description || ""}`.toLocaleLowerCase();
    if (hay.includes(needle))
      results.push({
        type: "concept",
        id: n.id,
        title: n.label,
        snippet: `${n.description || "Concept"} · ${(n.slides || []).length} evidence slides`,
      });
  });
  if ("overview".includes(needle))
    results.push({
      type: "command",
      id: "overview",
      title: "Open overview",
      snippet: "Show the hierarchy and knowledge graph",
    });
  if ("presentation".includes(needle))
    results.push({
      type: "command",
      id: "presentation",
      title: "Presentation mode",
      snippet: "Hide chrome and request fullscreen",
    });
  (state.deck.focusRegions || []).forEach((region) => {
    if (`${region.label} ${region.id}`.toLowerCase().includes(needle))
      results.push({
        type: "focus",
        id: region.id,
        title: region.label,
        snippet: `Focus region on slide ${region.slideId}`,
      });
  });
  return results.slice(0, 24);
}
function updateSearch(query) {
  state.searchResults = parseSearch(query);
  state.searchIndex = 0;
  els.searchResults.innerHTML = state.searchResults.length
    ? state.searchResults
        .map(
          (r, i) =>
            `<button class="search-result ${i === 0 ? "selected" : ""}" role="option" aria-selected="${i === 0}" data-result="${i}" type="button"><span class="result-type">${r.type}</span><span><span class="result-title">${escapeHtml(r.title)}</span><span class="result-snippet">${escapeHtml(r.snippet)}</span></span><span class="result-id">${escapeHtml(r.id)}</span></button>`,
        )
        .join("")
    : '<div class="no-results">No matching slides or concepts. Try a title, an alias, or <strong>#12</strong>.</div>';
  $$(".search-result", els.searchResults).forEach((button) =>
    button.addEventListener("click", () =>
      openSearchResult(Number(button.dataset.result)),
    ),
  );
}
function openSearchResult(index) {
  const result = state.searchResults[index];
  if (!result) return;
  els.search.close();
  if (result.type === "slide") navigateTo(result.id, { detour: true });
  else if (result.type === "focus") {
    const region = state.deck.focusRegions.find((r) => r.id === result.id);
    navigateTo(region.slideId, { detour: true });
    fitRegion(region);
  } else if (result.type === "concept" && !state.graphError) {
    openOverview();
    state.mode = "graph";
    $$(".overview-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === "graph");
      b.setAttribute("aria-selected", String(b.dataset.view === "graph"));
    });
    renderOverview();
    focusConcept(result.id);
  } else if (result.id === "overview") openOverview();
  else openPresentation();
}

function openConceptModal(id) {
  const concept = state.graph.concepts.find((node) => node.id === id);
  if (!concept) return;
  state.graphFocus = id;
  els.conceptContent.innerHTML = `<div class="concept-content"><h3>${escapeHtml(concept.label)}</h3><p class="concept-description">${escapeHtml(concept.description || "")}</p><h4 class="evidence-title">Original mentions</h4>${evidenceMarkup(concept.mentions)}<h4 class="evidence-title">Relationships and source evidence</h4>${relationshipMarkup(concept)}</div>`;
  $("#conceptHeading").textContent = concept.label;
  if (!els.concept.open) els.concept.showModal();
  bindEvidenceLinks(els.conceptContent);
}

function openResource(path) {
  const destination = deckAsset(path);
  if (/\.html?$/i.test(path)) {
    $("#demoHeading").textContent = "Linked resource";
    if (fileMode) els.demoFrame.srcdoc = embeddedDeck.resources?.[destination] || "Resource unavailable";
    else els.demoFrame.src = destination;
    els.demo.showModal();
  } else window.open(assetUrl(destination), "_blank", "noopener");
}
function reconcilePresentation(enabled) {
  state.presentation = enabled;
  document.body.classList.toggle("presentation-mode", enabled);
  els.app.classList.toggle("presentation-mode", enabled);
  updateUI();
  requestAnimationFrame(() => {
    fitCurrent(false);
    persist();
  });
}
function openPresentation() {
  finishActiveStroke();
  const enabled = !state.presentation;
  const request = ++presentationRequest;
  reconcilePresentation(enabled);
  if (enabled && document.documentElement.requestFullscreen) {
    try {
      Promise.resolve(document.documentElement.requestFullscreen()).catch(
        () => {
          if (request !== presentationRequest || !state.presentation) return;
          reconcilePresentation(true);
          toast("Fullscreen unavailable · presentation layout enabled");
        },
      );
    } catch (_) {
      reconcilePresentation(true);
    }
  } else if (!enabled && document.fullscreenElement) {
    Promise.resolve(document.exitFullscreen?.()).catch(() => {});
  }
}

function toggleBlackout(force) {
  finishActiveStroke();
  state.blackout = force ?? !state.blackout;
  els.blackout.classList.toggle("open", state.blackout);
  els.blackout.setAttribute("aria-hidden", String(!state.blackout));
}
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(
    () => els.toast.classList.remove("show"),
    2200,
  );
}

function recordHistoryView() {
  const entry = state.history[state.historyIndex];
  if (!entry) return;
  Object.assign(entry, {
    camera: { ...state.camera },
    board: state.whiteboard,
    boardName,
    boardReturnCamera: boardReturnCamera ? { ...boardReturnCamera } : null,
    routeCursor,
    detourReturn: state.detourReturn
      ? structuredClone(state.detourReturn)
      : null,
  });
}
function sessionPayload() {
  recordHistoryView();
  return structuredClone({
    schemaVersion: 2,
    deckId: state.deck.id,
    revision: state.deck.revision,
    savedAt: new Date().toISOString(),
    currentId: state.currentId,
    routeCursor,
    camera: state.camera,
    whiteboard: state.whiteboard,
    boardName,
    boardReturnCamera,
    overview: state.overview,
    mode: state.mode,
    graphFocus: state.graphFocus,
    history: state.history,
    historyIndex: state.historyIndex,
    undoStacks,
    redoStacks,
    annotations: state.annotations,
    boards: state.boards,
    boardMeta: state.boardMeta,
    visited: [...state.visited],
    detourReturn: state.detourReturn,
    tool: state.tool,
    color: state.color,
  });
}
function validateSession(input) {
  const fail = (message) => {
    throw new Error(`Invalid session: ${message}`);
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("expected an object");
  if (input.schemaVersion !== 2) fail("unsupported schema version");
  if (input.revision !== state.deck.revision || input.deckId !== state.deck.id)
    throw new Error(
      "This session belongs to a different deck revision. It has not been applied.",
    );
  const ids = new Set(state.deck.slides.map((slide) => slide.id));
  const object = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every(
      (key) => !["__proto__", "constructor", "prototype"].includes(key),
    );
  const finite = (value, min, max) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
  const integer = (value, min, max) =>
    Number.isInteger(value) && value >= min && value <= max;
  const board = (value) =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    !value.includes("::") &&
    !/[\x00-\x1f]/.test(value);
  const camera = (value) => {
    if (
      !object(value) ||
      !finite(value.x, -1e7, 1e7) ||
      !finite(value.y, -1e7, 1e7) ||
      !finite(value.scale, 0.03, 32)
    )
      fail("camera");
    return { x: value.x, y: value.y, scale: value.scale };
  };
  const route = (value) => {
    if (value === null) return null;
    if (
      !object(value) ||
      !ids.has(value.id) ||
      !integer(value.routeIndex, 0, state.deck.route.length - 1) ||
      state.deck.route[value.routeIndex] !== value.id ||
      (value.boardName != null && !board(value.boardName))
    )
      fail("return point");
    return {
      id: value.id,
      routeIndex: value.routeIndex,
      camera: camera(value.camera),
      boardName: value.boardName || null,
    };
  };
  const operations = (value, id) => {
    const {width, height} = slideSize(id);
    if (!Array.isArray(value) || value.length > 10000)
      fail("annotation collection");
    const cleaned = value.map((op) => {
      if (op?.type === "diagram") {
        try { return PigeonDiagram.validate(op, {width, height}); }
        catch(error) { fail(error.message); }
      }
      if (
        !object(op) ||
        op.type !== "stroke" ||
        !Array.isArray(op.points) ||
        !op.points.length ||
        op.points.length > 100000 ||
        !finite(op.width, 0.1, 100) ||
        !/^#[0-9a-f]{6}$/i.test(op.color) ||
        (op.opacity !== undefined && !finite(op.opacity, 0, 1)) ||
        (op.tool !== undefined && !["pen", "highlighter"].includes(op.tool))
      )
        fail("Malformed stroke data");
      const points = op.points.map((point) => {
        if (
          !object(point) ||
          !finite(point.x, 0, width) ||
          !finite(point.y, 0, height) ||
          (point.pressure !== undefined && !finite(point.pressure, 0, 1))
        )
          fail("Malformed stroke coordinates");
        return {
          x: point.x,
          y: point.y,
          ...(point.pressure !== undefined ? { pressure: point.pressure } : {}),
        };
      });
      return {
        type: "stroke",
        tool: op.tool || "pen",
        color: op.color,
        width: op.width,
        opacity: op.opacity ?? 1,
        points,
      };
    });
    const diagramIds = cleaned.filter(o => o.type === "diagram").map(o => o.id);
    if (new Set(diagramIds).size !== diagramIds.length) fail("duplicate diagram IDs");
    const shapeIds = new Set(cleaned.filter(o => o.type === "diagram" && !["line", "arrow"].includes(o.kind)).map(o => o.id));
    for (const o of cleaned) if (o.type === "diagram" && ["line", "arrow"].includes(o.kind)) {
      if ([o.startBinding, o.endBinding].some(id => id !== null && !shapeIds.has(id))) fail("unknown connector target");
    }
    return cleaned;
  };
  const boardId = (key) => {
    const parts = key.split("::");
    return parts.length === 2 && ids.has(parts[0]) && board(parts[1]);
  };
  const inkMap = (value, isBoard) => {
    if (!object(value)) fail("annotation map");
    const result = {};
    for (const [key, ops] of Object.entries(value)) {
      if (isBoard ? !boardId(key) : !ids.has(key))
        fail("unknown annotation surface");
      result[key] = operations(ops, isBoard ? key.split("::")[0] : key);
    }
    return result;
  };
  const stacks = (value) => {
    if (!object(value)) fail("undo/redo map");
    const result = {};
    for (const [key, snapshots] of Object.entries(value)) {
      if (
        !(key.startsWith("slide:") && ids.has(key.slice(6))) &&
        !(key.startsWith("board:") && boardId(key.slice(6)))
      )
        fail("undo surface");
      if (!Array.isArray(snapshots) || snapshots.length > 80)
        fail("undo history");
      result[key] = snapshots.map(ops => operations(ops, key.slice(6).split("::")[0]));
    }
    return result;
  };
  const view = (value) => {
    if (
      !object(value) ||
      !ids.has(value.id) ||
      typeof value.board !== "boolean" ||
      !board(value.boardName) ||
      !integer(value.routeCursor, 0, state.deck.route.length - 1)
    )
      fail("history view");
    return {
      id: value.id,
      camera: camera(value.camera),
      board: value.board,
      boardName: value.boardName,
      boardReturnCamera:
        value.boardReturnCamera === null
          ? null
          : camera(value.boardReturnCamera),
      routeCursor: value.routeCursor,
      detourReturn: route(value.detourReturn),
    };
  };
  if (
    !ids.has(input.currentId) ||
    !integer(input.routeCursor, 0, state.deck.route.length - 1) ||
    !board(input.boardName) ||
    typeof input.whiteboard !== "boolean" ||
    typeof input.overview !== "boolean" ||
    !["hierarchy", "graph"].includes(input.mode) ||
    !["navigate", "laser", "pen", "highlighter", "eraser", "wand", "diagram"].includes(
      input.tool,
    ) ||
    !Object.values(COLORS).includes(input.color)
  )
    fail("navigation or tool fields");
  if (
    input.graphFocus !== null &&
    (typeof input.graphFocus !== "string" ||
      (!state.graphError &&
        !state.graph.concepts.some((node) => node.id === input.graphFocus)))
  )
    fail("unknown concept focus");
  if (!Array.isArray(input.visited) || input.visited.some((id) => !ids.has(id)))
    fail("visited slides");
  if (
    !Array.isArray(input.history) ||
    input.history.length > 60 ||
    !integer(
      input.historyIndex,
      input.history.length ? 0 : -1,
      input.history.length - 1,
    )
  )
    fail("navigation history");
  if (
    typeof input.savedAt !== "string" ||
    !Number.isFinite(Date.parse(input.savedAt))
  )
    fail("saved timestamp");
  const normalizedBoards = inkMap(input.boards, true);
  const boardMeta = {};
  if (input.boardMeta !== undefined && !object(input.boardMeta)) fail("board metadata");
  for (const [key, meta] of Object.entries(input.boardMeta || {})) {
    if (!boardId(key) || !object(meta) || !["white", "black"].includes(meta.color) ||
        typeof meta.kept !== "boolean" || typeof meta.inserted !== "boolean") fail("board metadata");
    boardMeta[key] = {color: meta.color, kept: meta.kept, inserted: meta.inserted};
  }
  // Existing version-2 board ink becomes a separate inserted board without data loss.
  for (const key of Object.keys(normalizedBoards)) boardMeta[key] ||= {color: "white", kept: true, inserted: true};
  if (input.whiteboard) {
    const key = `${input.currentId}::${input.boardName}`;
    boardMeta[key] ||= {color: "white", kept: false, inserted: true};
    boardMeta[key].inserted = true;
  }
  if (Object.keys(boardMeta).length > 200) fail("too many boards");
  const result = {
    schemaVersion: 2,
    deckId: input.deckId,
    revision: input.revision,
    savedAt:
      typeof input.savedAt === "string"
        ? input.savedAt
        : new Date().toISOString(),
    currentId: input.currentId,
    routeCursor: input.routeCursor,
    camera: camera(input.camera),
    whiteboard: input.whiteboard,
    boardName: input.boardName,
    boardReturnCamera:
      input.boardReturnCamera === null ? null : camera(input.boardReturnCamera),
    overview: input.overview,
    mode: input.mode,
    graphFocus: state.graphError ? null : input.graphFocus,
    history: input.history.map(view),
    historyIndex: input.historyIndex,
    annotations: inkMap(input.annotations, false),
    boards: normalizedBoards,
    boardMeta,
    undoStacks: stacks(input.undoStacks),
    redoStacks: stacks(input.redoStacks),
    visited: [...new Set(input.visited)],
    detourReturn: route(input.detourReturn),
    tool: input.tool,
    color: input.color,
  };
  if (input.boardMeta === undefined && Object.keys(result.boardMeta).length) {
    // Earlier sessions overlaid boards on the source frame. Translate their
    // saved cameras into the expanded layout without moving ink coordinates.
    const count = state.deck.slides.length, cols = count > 20 ? 5 : 4;
    const sequence = viewSequence(result.boardMeta);
    function shift(camera, id, name = null) {
      if (!camera) return;
      const index = state.deck.slides.findIndex(slide => slide.id === id);
      const old = {x: (index % cols) * 1050 - ((cols - 1) * 1050) / 2 - 480,
        y: Math.floor(index / cols) * 650 - ((Math.ceil(count / cols) - 1) * 650) / 2 - 270};
      const next = framePosition(index, name, sequence);
      camera.x -= (next.x - old.x) * camera.scale;
      camera.y -= (next.y - old.y) * camera.scale;
    }
    function migrateReturn(value) { if (value) shift(value.camera, value.id, value.boardName); }
    shift(result.camera, result.currentId, result.whiteboard ? result.boardName : null);
    shift(result.boardReturnCamera, result.currentId);
    migrateReturn(result.detourReturn);
    for (const view of result.history) {
      shift(view.camera, view.id, view.board ? view.boardName : null);
      shift(view.boardReturnCamera, view.id);
      migrateReturn(view.detourReturn);
    }
  }
  return result;
}
function storageKey() {
  return `${STORAGE_KEY}:${state.deck.id}:${state.deck.revision}`;
}
function databaseWrite(records) {
  return new Promise((resolve, reject) => {
    if (!sessionDb) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    try {
      const transaction = sessionDb.transaction("sessions", "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(
          transaction.error || new Error("Session storage transaction failed"),
        );
      for (const [key, value] of records)
        transaction.objectStore("sessions").put(value, key);
    } catch (error) {
      reject(error);
    }
  });
}
function databaseRead(key) {
  return new Promise((resolve, reject) => {
    if (!sessionDb) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    try {
      const request = sessionDb
        .transaction("sessions", "readonly")
        .objectStore("sessions")
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}
function persist() {
  if (booting || persistenceSuspended || !state.deck.revision) return;
  const payload = sessionPayload();
  let localSaved = false;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(payload));
    localSaved = true;
  } catch (_) {}
  if (sessionDb)
    databaseWrite([[storageKey(), payload]]).catch(() => {
      if (!localSaved)
        toast("Session could not be saved · export a portable copy");
    });
  else if (!localSaved)
    toast("Browser storage is unavailable · export a session copy");
}
function applySession(input) {
  diagram?.reset();
  const payload = validateSession(input);
  for (const key of Object.keys(undoStacks)) delete undoStacks[key];
  for (const key of Object.keys(redoStacks)) delete redoStacks[key];
  Object.assign(undoStacks, payload.undoStacks);
  Object.assign(redoStacks, payload.redoStacks);
  Object.assign(state, {
    currentId: payload.currentId,
    camera: payload.camera,
    autoFit: false,
    whiteboard: payload.whiteboard,
    overview: payload.overview,
    mode:
      state.graphError && payload.mode === "graph" ? "hierarchy" : payload.mode,
    graphFocus: payload.graphFocus,
    history: payload.history,
    historyIndex: payload.historyIndex,
    annotations: payload.annotations,
    boards: payload.boards,
    boardMeta: payload.boardMeta,
    visited: new Set(payload.visited),
    detourReturn: payload.detourReturn,
    tool: payload.tool,
    color: payload.color,
  });
  routeCursor = payload.routeCursor;
  boardName = payload.boardName;
  boardReturnCamera = payload.boardReturnCamera;
  state.currentIndex = state.deck.slides.findIndex(
    (slide) => slide.id === state.currentId,
  );
  return payload;
}
function restore() {
  try {
    const payload = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (payload) {
      applySession(payload);
      restoredSession = true;
    }
  } catch (error) {
    toast(error.message);
  }
}
async function initStorage() {
  try {
    sessionDb = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pigeon", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("sessions");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const payload = await databaseRead(storageKey());
    let localPayload = null;
    try {
      localPayload = JSON.parse(localStorage.getItem(storageKey()) || "null");
    } catch (_) {}
    if (
      payload &&
      (!restoredSession ||
        Date.parse(payload.savedAt) > Date.parse(localPayload?.savedAt || 0))
    ) {
      applySession(payload);
      restoredSession = true;
      renderFrames();
      updateUI();
      if (state.overview) openOverview();
    }
    backupKey = (await databaseRead(`${storageKey()}:last-backup`)) || null;
  } catch (_) {
    /* Portable JSON and localStorage remain available. */
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSession() {
  download(
    new Blob([JSON.stringify(sessionPayload(), null, 2)], {
      type: "application/json",
    }),
    `${state.deck.id}-annotations-${Date.now()}.json`,
  );
}
async function replaceSessionSafely(input) {
  const incoming = validateSession(input);
  incoming.savedAt = new Date().toISOString();
  // Validate before finishing a gesture or changing any live field.
  finishActiveStroke();
  const previous = sessionPayload();
  const nextBackupKey = `${storageKey()}:backup:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  persistenceSuspended = true;
  try {
    if (sessionDb) {
      // One transaction guarantees that the backup and replacement commit together.
      await databaseWrite([
        [nextBackupKey, previous],
        [storageKey(), incoming],
        [`${storageKey()}:last-backup`, nextBackupKey],
      ]);
      try {
        localStorage.setItem(nextBackupKey, JSON.stringify(previous));
        localStorage.setItem(`${storageKey()}:last-backup`, nextBackupKey);
        localStorage.setItem(storageKey(), JSON.stringify(incoming));
      } catch (_) {}
    } else {
      const serialized = JSON.stringify(previous);
      localStorage.setItem(nextBackupKey, serialized);
      if (localStorage.getItem(nextBackupKey) !== serialized)
        throw new Error("The existing session backup could not be verified.");
      localStorage.setItem(`${storageKey()}:last-backup`, nextBackupKey);
      localStorage.setItem(storageKey(), JSON.stringify(incoming));
    }
    applySession(incoming);
    backupKey = nextBackupKey;
  } finally {
    persistenceSuspended = false;
  }
  renderFrames();
  setTool(state.tool);
  setColor(state.color);
  updateUI();
  renderOverview();
  if (state.overview) openOverview();
  else closeOverview();
  return true;
}
async function importSession(file) {
  if (!file) return false;
  try {
    await replaceSessionSafely(JSON.parse(await file.text()));
    toast("Session imported · previous work is available in Recover backup");
    return true;
  } catch (error) {
    toast(
      `Import refused: ${error.message || "unable to preserve the current session"}`,
    );
    return false;
  }
}
async function recoverBackup() {
  try {
    const key =
      backupKey || localStorage.getItem(`${storageKey()}:last-backup`);
    if (!key) throw new Error("No imported-session backup is available.");
    let payload = sessionDb ? await databaseRead(key) : null;
    if (!payload) payload = JSON.parse(localStorage.getItem(key) || "null");
    if (!payload) throw new Error("The backup is unavailable.");
    await replaceSessionSafely(payload);
    toast("Backup recovered · the replaced session was backed up too");
  } catch (error) {
    toast(`Recovery failed: ${error.message}`);
  }
}

async function exportPng() {
  diagram?.finish();
  diagram?.closeEditor();
  try {
    finishActiveStroke();
    const output = document.createElement("canvas");
    const {width, height} = slideSize();
    output.width = Math.ceil(width * 2);
    output.height = Math.ceil(height * 2);
    const context = output.getContext("2d");
    context.scale(2, 2);
    context.fillStyle = state.whiteboard && boardInfo().color === "black" ? "#111827" : "white";
    context.fillRect(0, 0, width, height);
    if (!state.whiteboard) {
      const image = new Image();
      image.src = assetUrl(deckAsset(getSlide().asset));
      await image.decode();
      context.drawImage(image, 0, 0, width, height);
    }
    surfaceOps().forEach((op) => drawOperation(context, op));
    output.toBlob(
      (blob) => {
        if (!blob) {
          toast("PNG export failed: the browser could not encode the image");
          return;
        }
        download(
          blob,
          `${state.deck.id}-${state.currentId}-${state.whiteboard ? "board" : "slide"}.png`,
        );
      },
      "image/png",
    );
  } catch (error) {
    toast(`PNG export failed: ${error.message}`);
  }
}
async function verifyAssets() {
  const assets = state.deck.slides.map((s) =>
    s.asset.startsWith("public/") ? s.asset : `public/deck/${s.asset}`,
  );
  assets.push(
    "public/deck/knowledge-graph.json",
    state.deck.pdf,
    ...state.deck.resources.map(deckAsset),
    ...state.deck.slides.flatMap(s => s.titleLayer ? [deckAsset(s.titleLayer.asset), deckAsset(s.titleLayer.baseAsset)] : []),
  );
  const results = await Promise.allSettled(
    assets.map(async (path) => {
      if (fileMode) {
        if (path.endsWith("knowledge-graph.json")) return loadJson(path);

        assetUrl(path);
        return;
      }
      const response = await fetch(path);
      if (!response.ok) throw new Error(path);
      await response.arrayBuffer();
    }),
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (state.graphError) {
    els.ready.textContent = "Graph unavailable · rebuild required";
    els.ready.title = state.graphError;
    els.ready.classList.add("warning");
    return;
  }
  if (state.manifestError) return;
  els.ready.textContent = failed.length
    ? `${failed.length} local assets unavailable`
    : state.graph.extraction?.reviewRequired
      ? "Ready offline · graph review pending"
      : "Ready offline";
  els.ready.classList.toggle("warning", !!failed.length);
}

function keyHandler(event) {
  if (!state.deck.slides.length) return;
  const target = event.target;
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;
  if (event.isComposing) return;
  const key = event.key;
  const mod = event.metaKey || event.ctrlKey;
  if (!state.overview && !document.querySelector("dialog[open]") && diagram?.key(event)) return;
  if (key === "Escape") {
    if (dismissTopOverlay()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (state.stickyPen) {
      event.preventDefault();
      setStickyPen(false);
      return;
    }
    if (state.tool === "diagram" && diagram?.key(event)) return;
    if (!typing && state.tool !== "navigate") {
      event.preventDefault();
      setTool("navigate");
    }
    return;
  }
  if (typing) return;
  if (
    els.demo.open ||
    els.about.open ||
    els.help.open ||
    els.concept.open ||
    els.search.open ||
    $("#sessionDialog").open ||
    $("#readingDialog").open
  )
    return;
  if (mod) {
    if (key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    } else if (key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    return;
  }
  if (key === "`" || event.code === "Backquote") {
    event.preventDefault();
    if (!event.repeat) toggleStickyPen();
    return;
  }
  if (key === " " && target.closest?.("button,a,select")) return;
  if (key === " " && !state.overview) {
    diagram?.finish();
    finishActiveStroke();
    spaceDown = true;
    event.preventDefault();
    return;
  }
  if (!state.overview && event.shiftKey && key.startsWith("Arrow")) {
    if (state.currentStroke?.sticky) finishActiveStroke();
    if (state.currentStroke) return;
    event.preventDefault();
    state.autoFit = false;
    state.camera.x += key === "ArrowLeft" ? 40 : key === "ArrowRight" ? -40 : 0;
    state.camera.y += key === "ArrowUp" ? 40 : key === "ArrowDown" ? -40 : 0;
    updateCamera();
    persist();
    return;
  }
  if (
    state.overview &&
    ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(key)
  ) {
    const graphNode = target.closest?.(".graph-node");
    const tile = target.closest?.(".slide-tile");
    // Arrow navigation must work even when Safari leaves focus on the toolbar/body.
    // Enter on real controls retains native activation; tiles are handled explicitly.
    if (key === "Enter" && !graphNode && !tile && target.closest?.("button,a,select")) return;
    event.preventDefault();
    event.stopPropagation();
    overviewKey(key);
    return;
  }
  if (key === "ArrowRight" || key === "PageDown") {
    event.preventDefault();
    nextSlide(1);
    return;
  }
  if (key === "ArrowLeft" || key === "PageUp") {
    event.preventDefault();
    nextSlide(-1);
    return;
  }
  const actions = {
    o: () => (state.overview ? closeOverview() : openOverview()),
    t: () => {
      if (state.overview) toggleOverviewMode();
    },
    "/": () => openSearch(),
    g: () => openSearch("#"),
    r: resumeRoute,
    "[": () => historyMove(-1),
    "]": () => historyMove(1),
    f: openPresentation,
    b: () => toggleBlackout(),
    "?": () => els.help.showModal(),
    v: () => setTool("navigate"),
    l: () => toggleTool("laser"),
    p: () => toggleTool("pen"),
    h: () => toggleTool("highlighter"),
    e: () => toggleTool("eraser"),
    w: () => event.shiftKey ? insertBoard("black") : toggleWhiteboard(),
    m: () => toggleTool("wand"),
    d: () => setTool("diagram"),
    k: keepBoard,
    "+": () => zoomAt(1.3),
    "=": () => zoomAt(1.3),
    "-": () => zoomAt(1 / 1.3),
    "0": () => { fitCurrent(false); persist(); },
    Home: fitWhole,
  };
  if (/^[1-4]$/.test(key)) {
    setColor(
      [COLORS.red, COLORS.blue, COLORS.green, COLORS.yellow][Number(key) - 1],
    );
    return;
  }
  const action = actions[key] || actions[key.toLowerCase()];
  if (action) {
    event.preventDefault();
    action();
  }
}
function focusOverviewSurface() {
  if (state.mode === "graph") graphNodeElement(state.graphFocus)?.focus();
  else focusHierarchy(state.hierarchyFocus || activeFrameKey());
}
function toggleOverviewMode() {
  if (state.graphError) {
    toast(state.graphError);
    return;
  }
  state.mode = state.mode === "hierarchy" ? "graph" : "hierarchy";
  $$(".overview-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.mode);
    b.setAttribute("aria-selected", String(b.dataset.view === state.mode));
  });
  renderOverview();
  focusOverviewSurface();
  persist();
}
function overviewKey(key) {
  if (state.mode === "hierarchy") {
    const buttons = $$(".slide-tile", els.overviewContent);
    let index = buttons.findIndex(button => button.dataset.frameKey === state.hierarchyFocus);
    if (index < 0) index = Math.max(0, buttons.findIndex(button => button.dataset.frameKey === activeFrameKey()));
    if (key === "Enter") { buttons[index]?.click(); return; }
    if (key === "ArrowDown" || key === "ArrowRight") index = clamp(index + 1, 0, buttons.length - 1);
    if (key === "ArrowUp" || key === "ArrowLeft") index = clamp(index - 1, 0, buttons.length - 1);
    focusHierarchy(buttons[index]?.dataset.frameKey);
  } else {
    const nodes = state.graph.concepts;
    const focused = nodes.find((n) => n.id === state.graphFocus) || nodes[0];
    if (key === "Enter") {
      openConceptModal(focused.id);
      return;
    }
    const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0,
      dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    const candidates = nodes.filter(
      (n) =>
        n.id !== focused.id &&
        (n.x - focused.x) * dx + (n.y - focused.y) * dy > 0,
    );
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - focused.x, a.y - focused.y) -
        Math.hypot(b.x - focused.x, b.y - focused.y),
    );
    focusConcept((candidates[0] || focused).id);
  }
}

function focusHierarchy(key) {
  const buttons = $$(".slide-tile", els.overviewContent);
  const selected = buttons.find(button => button.dataset.frameKey === key) || buttons[0];
  if (!selected) return;
  state.hierarchyFocus = selected.dataset.frameKey;
  for (const button of buttons) {
    const active = button === selected;
    button.classList.toggle("selected", active);
    button.tabIndex = active ? 0 : -1;
    button.setAttribute("aria-current", active ? "true" : "false");
  }
  selected.focus({preventScroll: true});
  selected.scrollIntoView?.({block: "nearest", inline: "nearest"});
}
function dismissTopOverlay() {
  const dialogs = [els.about, els.help, els.search, els.concept, $("#sessionDialog"), $("#readingDialog"), els.demo];
  const open = dialogs.find(dialog => dialog.open);
  if (open) { open.close(); return true; }
  if (state.blackout) { toggleBlackout(false); return true; }
  if (state.overview) { closeOverview(); return true; }
  return false;
}
function relayoutBoards() {
  const before = new Map($$(".slide-frame").map(frame => [frame.dataset.frameKey, {x: parseFloat(frame.style.left), y: parseFloat(frame.style.top)}]));
  renderFrames();
  const after = new Map($$(".slide-frame").map(frame => [frame.dataset.frameKey, {x: parseFloat(frame.style.left), y: parseFloat(frame.style.top)}]));
  function shift(camera, key) {
    const old = before.get(key), next = after.get(key);
    if (camera && old && next) { camera.x -= (next.x - old.x) * camera.scale; camera.y -= (next.y - old.y) * camera.scale; }
  }
  function shiftReturn(value) { if (value) shift(value.camera, frameKey(value.id, value.boardName || null)); }
  shift(state.camera, activeFrameKey());
  shift(boardReturnCamera, frameKey(state.currentId));
  shiftReturn(state.detourReturn);
  for (const entry of state.history) {
    shift(entry.camera, frameKey(entry.id, entry.board ? entry.boardName : null));
    shift(entry.boardReturnCamera, frameKey(entry.id));
    shiftReturn(entry.detourReturn);
  }
}
function insertBoard(color = "white", name = null) {
  finishActiveStroke();
  recordHistoryView();
  const id = state.currentId;
  if (!state.whiteboard) boardReturnCamera = {...state.camera};
  if (!name) {
    const base = color === "black" ? "Blackboard" : boardName;
    name = base;
    let count = 2;
    while (state.boardMeta[`${id}::${name}`]?.inserted) name = `${base} ${count++}`;
  }
  const key = `${id}::${name}`;
  state.boards[key] ||= [];
  state.boardMeta[key] = {...(state.boardMeta[key] || {color, kept: false}), inserted: true};
  relayoutBoards();
  navigateTo(id, {boardName: name, force: true});
  if (state.tool === "navigate") setTool("pen");
  els.stage.focus();
  toast(`${color === "black" ? "Blackboard" : "Whiteboard"} inserted · ← previous · → next · K keep`);
}
function toggleWhiteboard() {
  if (state.whiteboard) {
    const camera = boardReturnCamera ? {...boardReturnCamera} : null;
    navigateTo(state.currentId, {force: true});
    if (camera) { state.camera = camera; updateCamera(); persist(); }
    els.stage.focus();
  } else insertBoard("white");
}
function keepBoard() {
  if (!state.whiteboard) return;
  const meta = boardInfo();
  meta.kept = !meta.kept;
  state.boardMeta[boardKey()] = meta;
  updateUI(); renderOverview(); persist();
  els.stage.focus();
  toast(meta.kept ? "Board kept in this session and JSON export" : "Board marked as draft; ink remains saved");
}
function removeBoard() {
  if (!state.whiteboard) return;
  finishActiveStroke();
  const id = state.currentId, name = boardName;
  navigateTo(id, {force: true});
  const sourceCamera = {...state.camera};
  function retireReturn(value) {
    if (value?.id === id && value.boardName === name) {
      value.boardName = null;
      value.camera = {...sourceCamera};
    }
  }
  retireReturn(state.detourReturn);
  state.history.forEach(entry => retireReturn(entry.detourReturn));
  state.boardMeta[`${id}::${name}`].inserted = false;
  state.history = state.history.filter(entry => !(entry.id === id && entry.board && entry.boardName === name));
  state.historyIndex = state.history.length - 1;
  relayoutBoards(); fitCurrent(false); updateUI(); renderOverview(); persist();
  toast("Board removed from the talk · ink remains available in Session");
  els.stage.focus();
}

// Camera pan and pointer-centred zoom are kept outside the slide frames so drawing stays in slide coordinates.
let pan = null;
els.stage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    diagram?.finish();
    if (state.currentStroke?.sticky) finishActiveStroke();
    if (state.currentStroke) return;
    if (event.ctrlKey || event.metaKey) {
      zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    } else {
      state.autoFit = false;
      hideWand();
      const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? els.stage.clientHeight : 1;
      state.camera.x -= (event.shiftKey ? event.deltaY : event.deltaX) * unit;
      state.camera.y -= (event.shiftKey ? event.deltaX : event.deltaY) * unit;
      updateCamera(); persist();
    }
  },
  { passive: false },
);
els.stage.addEventListener("pointermove", (event) => {
  showLaser(event);
  showWand(event);
  if (!pan || state.currentStroke) return;
  state.autoFit = false;
  state.camera.x = pan.x + event.clientX - pan.clientX;
  state.camera.y = pan.y + event.clientY - pan.clientY;
  updateCamera();
});
els.stage.addEventListener("pointerdown", (event) => {
  if (
    state.currentStroke ||
    (state.tool !== "navigate" && !spaceDown && !diagram?.isHand()) ||
    (event.target.closest(".slide-frame") && !spaceDown && !diagram?.isHand())
  )
    return;
  suppressSpace = spaceDown;
  pan = {
    x: state.camera.x,
    y: state.camera.y,
    clientX: event.clientX,
    clientY: event.clientY,
  };
  els.stage.setPointerCapture(event.pointerId);
});
els.stage.addEventListener("pointerup", () => {
  if (pan) persist();
  pan = null;
});
els.stage.addEventListener("pointercancel", () => {
  pan = null;
});

$("#overviewButton").addEventListener("click", () =>
  state.overview ? closeOverview() : openOverview(),
);
$("#overviewClose").addEventListener("click", closeOverview);
$("#searchButton").addEventListener("click", () => openSearch());
$("#helpButton").addEventListener("click", () => els.help.showModal());
$("#aboutButton").addEventListener("click", () => els.about.showModal());
$("#aboutFromHelp").addEventListener("click", () => {
  els.help.close();
  els.about.showModal();
});
$("#presentationButton").addEventListener("click", openPresentation);
$("#previousButton").addEventListener("click", () => nextSlide(-1));
$("#nextButton").addEventListener("click", () => nextSlide(1));
$("#resumeHud").addEventListener("click", resumeRoute);
$("#fitButton").addEventListener("click", fitWhole);
$("#zoomIn").addEventListener("click", () => zoomAt(1.3));
$("#zoomOut").addEventListener("click", () => zoomAt(1 / 1.3));
$("#blackoutButton").addEventListener("click", () => toggleBlackout());
$("#blackoutExit").addEventListener("click", () => toggleBlackout(false));
$("#whiteboardButton").addEventListener("click", toggleWhiteboard);
$("#undoButton").addEventListener("click", undo);
$("#redoButton").addEventListener("click", redo);
$("#clearButton").addEventListener("click", clearSurface);
$$(".tool-button[data-tool]").forEach((button) =>
  button.addEventListener("click", () => { toggleTool(button.dataset.tool); els.stage.focus(); }),
);
$$(".swatch").forEach((button) =>
  button.addEventListener("click", () => { setColor(button.dataset.color); els.stage.focus(); }),
);
$$("[data-close]").forEach((button) =>
  button.addEventListener("click", () =>
    document.getElementById(button.dataset.close).close(),
  ),
);
$$(".overview-tab").forEach((button) =>
  button.addEventListener("click", () => {
    state.mode = button.dataset.view;
    $$(".overview-tab").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-selected", String(b === button));
    });
    renderOverview();
    focusOverviewSurface();
    persist();
  }),
);
els.searchInput.addEventListener("input", (event) =>
  updateSearch(event.target.value),
);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.searchIndex = clamp(
      state.searchIndex + 1,
      0,
      state.searchResults.length - 1,
    );
    updateSearchSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.searchIndex = clamp(
      state.searchIndex - 1,
      0,
      state.searchResults.length - 1,
    );
    updateSearchSelection();
  } else if (event.key === "Enter") {
    event.preventDefault();
    openSearchResult(state.searchIndex);
  }
});
function updateSearchSelection() {
  $$(".search-result", els.searchResults).forEach((button, i) => {
    button.classList.toggle("selected", i === state.searchIndex);
    button.setAttribute("aria-selected", String(i === state.searchIndex));
  });
}
document.addEventListener("keydown", keyHandler, true);
for (const dialog of $$("dialog")) dialog.addEventListener("cancel", event => {
  event.preventDefault();
  dialog.close();
});
for (const dialog of $$("dialog")) new MutationObserver(() => {
  if (dialog.open) { finishActiveStroke(); diagram?.finish(); diagram?.closeEditor(); }
}).observe(dialog, {attributes:true, attributeFilter:["open"]});
els.help.addEventListener("close", () => els.stage.focus());
els.stage.addEventListener("pointerleave", hideWand);
document.addEventListener("keyup", (event) => {
  if (event.key === " ") {
    if (
      spaceDown &&
      !suppressSpace &&
      !event.target.matches("input,textarea") &&
      !state.overview &&
      !document.querySelector("dialog[open]")
    )
      nextSlide(event.shiftKey ? -1 : 1);
    spaceDown = false;
    suppressSpace = false;
  }
});
window.addEventListener("blur", () => {
  diagram?.finish();
  setStickyPen(false);
  pan = null;
  spaceDown = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setStickyPen(false);
});
document.addEventListener("fullscreenchange", () =>
  (() => {
    if (!document.fullscreenElement && document.querySelector("dialog[open]")) {
      dismissTopOverlay();
      // Browsers may reserve Escape; preserve the clean presentation layout.
      reconcilePresentation(true);
    } else reconcilePresentation(!!document.fullscreenElement);
  })(),
);
window.addEventListener("resize", () => {
  if (!state.overview) {
    if (state.autoFit) fitCurrent(false);
    else updateCamera();
    persist();
  }
});

setTool("navigate");
setColor(COLORS.red);
loadDeck().then(async (loaded) => {
  if (!loaded) {
    window.dispatchEvent(new Event("presentation-started"));
    return;
  }
  restore();
  renderFrames();
  setTool(state.tool);
  setColor(state.color);
  updateUI();
  if (!restoredSession) {
    fitCurrent(false);
    addHistory(state.currentId);
  }
  if (state.overview) openOverview();
  await initStorage();
  booting = false;
  persist();
  window.dispatchEvent(new Event("presentation-started"));
}).catch(error => {
  window.dispatchEvent(new CustomEvent("presentation-start-failed", {detail: error.message}));
});

// Blob URLs keep the PDF fallback usable without file fetches or top-level data navigation.
let pdfObjectUrl;
$("#pdfLink").addEventListener("click", event => {
  if (!fileMode) return;
  event.preventDefault();
  try {
    if (!pdfObjectUrl) {
      const encoded = assetUrl(state.deck.pdf).split(",")[1];
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      pdfObjectUrl = URL.createObjectURL(new Blob([bytes], {type: "application/pdf"}));
    }
    window.open(pdfObjectUrl, "_blank", "noopener");
  } catch (error) {
    toast(`PDF unavailable: ${error.message}`);
  }
});

$("#sessionButton").addEventListener("click", () => {
  refreshBoardList();
  $("#sessionDialog").showModal();
});
$("#exportSessionButton").addEventListener("click", exportSession);
$("#importSessionInput").addEventListener("change", (event) => {
  importSession(event.target.files[0]);
  event.target.value = "";
});
$("#exportPngButton").addEventListener("click", exportPng);
$("#continueHereButton").addEventListener("click", () => {
  continueFromHere();
  $("#sessionDialog").close();
});
$("#motionButton").addEventListener("click", () => {
  state.reducedMotion = !state.reducedMotion;
  cancelPageTransition();
  clearTimeout(cameraTransitionTimer);
  els.world.style.transition = "none";
  syncTitleEffect(true);
  toast(
    state.reducedMotion
      ? "Reduced motion enabled"
      : "Animations enabled",
  );
});
els.demoFrame.addEventListener("load", () => {
  try {
    els.demoFrame.contentDocument.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        els.demo.close();
        els.stage.focus();
      }
    });
  } catch (_) {}
});

function refreshBoardList() {
  const names = [
    ...new Set([
      "Main",
      ...Object.keys(state.boards)
        .filter((key) => key.startsWith(`${state.currentId}::`))
        .map((key) => key.split("::").slice(1).join("::")),
    ]),
  ];
  $("#boardSelect").innerHTML = '<option value="" disabled selected>Open or recover a board…</option>' + names
    .map(
      (name) =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}${state.boardMeta[`${state.currentId}::${name}`]?.inserted === false ? " (removed · recover)" : ""}</option>`,
    )
    .join("");
}
$("#boardSelect").addEventListener("change", event => {
  const name = event.target.value;
  $("#sessionDialog").close();
  insertBoard(boardInfo(state.currentId, name).color, name);
});
$("#addBoardButton").addEventListener("click", () => {
  const name = $("#boardNameInput").value.trim().slice(0, 80);
  if (!name || name.includes("::") || /[\x00-\x1f]/.test(name)) {
    toast("Use a board name without :: or control characters"); return;
  }
  $("#sessionDialog").close();
  insertBoard($("#boardColorSelect").value, name);
  $("#boardNameInput").value = "";
});
$("#blackboardButton").addEventListener("click", () => insertBoard("black"));
$("#boardReturnButton").addEventListener("click", toggleWhiteboard);
$("#keepBoardButton").addEventListener("click", keepBoard);
$("#removeBoardButton").addEventListener("click", removeBoard);

function fitRegion(region) {
  if (state.currentStroke) return;
  const rect = region.rect;
  const index = state.deck.slides.findIndex((s) => s.id === region.slideId);
  if (!rect || index < 0) return;
  const position = framePosition(index);
  const bounds = els.stage.getBoundingClientRect();
  const scale = clamp(
    Math.min(
      bounds.width / (rect.width + 60),
      bounds.height / (rect.height + 90),
    ),
    0.12,
    2.5,
  );
  state.camera = {
    scale,
    x: -(position.x + rect.x + rect.width / 2) * scale,
    y: -(position.y + rect.y + rect.height / 2) * scale,
  };
  updateCamera();
  persist();
}

let presentationIdleTimer;
function wakePresentationControls() {
  if (!state.presentation) return;
  els.app.classList.add("presentation-awake");
  clearTimeout(presentationIdleTimer);
  presentationIdleTimer = setTimeout(
    () => els.app.classList.remove("presentation-awake"),
    2400,
  );
}
window.addEventListener("pointermove", wakePresentationControls);
window.addEventListener("keydown", wakePresentationControls);

els.concept.addEventListener("close", () => {
  if (state.overview) graphNodeElement(state.graphFocus)?.focus();
});
$("#recoverBackupButton").addEventListener("click", recoverBackup);
function updateReadingView(id = state.currentId) {
  const slide = getSlide(id);
  if (!slide) return;
  $("#readingText").textContent = slide.readingText || slide.text;
  $("#readingHeading").textContent = `${slide.id} · ${slide.title}`;
}
$("#readingButton").addEventListener("click", () => {
  finishActiveStroke();
  $("#readingSlideSelect").innerHTML = state.deck.slides
    .map(
      (slide) =>
        `<option value="${escapeHtml(slide.id)}" ${slide.id === state.currentId ? "selected" : ""}>${escapeHtml(slide.id)} · ${escapeHtml(slide.title)}</option>`,
    )
    .join("");
  updateReadingView();
  $("#readingDialog").showModal();
});
$("#readingSlideSelect").addEventListener("change", (event) =>
  updateReadingView(event.target.value),
);

// Canvas operations share the ink history and session/export paths.
diagram = PigeonDiagram.create({
  active: () => state.tool === "diagram" && !state.overview && !state.blackout,
  frame: () => $(".slide-frame.current"),
  surface: surfaceKey,
  getOps: surfaceOps,
  setOps: setSurface,
  size: slideSize,
  point: canvasPoint,
  checkpoint, persist, undo, redo,
  draw: () => drawSurface(state.currentId),
  focus: () => els.stage.focus(),
  exit: () => setTool("navigate"),
  canDraw: canvas => canvas.closest(".slide-frame").dataset.frameKey === activeFrameKey()
    && !spaceDown && !state.overview && !state.blackout && !document.querySelector("dialog[open]"),
  stopMotion: () => { cancelPageTransition(); clearTimeout(cameraTransitionTimer); els.world.style.transition = "none"; },
});
