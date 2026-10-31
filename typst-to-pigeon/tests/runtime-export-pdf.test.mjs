// Requires @napi-rs/canvas and a Python with PyMuPDF for independent PDF checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { setup, press, pointer } from "./runtime-harness.mjs";

const { createCanvas } = await import(process.env.PIGEON_CANVAS_DEPS
  ? pathToFileURL(resolve(process.env.PIGEON_CANVAS_DEPS, "@napi-rs/canvas/index.js")).href
  : "@napi-rs/canvas");
const root = resolve(process.env.PIGEON_FIXTURE_ROOT);

async function exporter(t) {
  const env = await setup(t), { w, d } = env;
  assert.ok(d.querySelector("#exportPdfButton"), "The top bar offers an annotated PDF");
  w.eval(await readFile(resolve(root, "src/vendor/pdf-lib.min.js"), "utf8"));
  // Match a browser's same-realm clone; pdf-lib validates Array via instanceof.
  const parse = w.eval("JSON.parse");
  w.structuredClone = value => parse(JSON.stringify(value));
  const canvases = new WeakMap(), downloads = [];
  const canvas = el => {
    if (!canvases.has(el)) canvases.set(el, createCanvas(el.width, el.height));
    return canvases.get(el);
  };
  w.HTMLCanvasElement.prototype.getContext = function() { return canvas(this).getContext("2d"); };
  w.HTMLCanvasElement.prototype.toBlob = function(callback) {
    callback(new w.Blob([canvas(this).toBuffer("image/png")], { type: "image/png" }));
  };
  w.URL.createObjectURL = blob => { downloads.push(blob); return "blob:test-pdf"; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function() { env.filename = this.download; };
  return Object.assign(env, { downloads });
}

async function inspect(t, blob, points = []) {
  const dir = await mkdtemp(resolve(tmpdir(), "pigeon-export-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pdf = resolve(dir, "export.pdf");
  await writeFile(pdf, new Uint8Array(await blob.arrayBuffer()));
  const checked = spawnSync(process.env.PIGEON_PYTHON || "python3", ["-c", `
import json, sys, pymupdf
doc = pymupdf.open(sys.argv[1])
points = json.loads(sys.argv[2])
out = []
for i, p in enumerate(doc):
    pix = p.get_pixmap(alpha=False)
    out.append(dict(text=p.get_text(), width=p.rect.width, height=p.rect.height,
        images=len(p.get_images()), rotation=p.rotation,
        pixel=pix.pixel(int(pix.width * points[i][0]), int(pix.height * points[i][1])) if i < len(points) else None))
print(json.dumps(out))
`, pdf, JSON.stringify(points)], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  return JSON.parse(checked.stdout);
}

test("PDF export retains source text and overlays all slides plus inserted draft/kept boards", async t => {
  const { a, d, w, downloads } = await exporter(t);
  const sourceData = w.PIGEON_DECK_BUNDLE.assets[a.state.deck.pdf];
  const originals = await inspect(t, new w.Blob([Buffer.from(sourceData.split(",")[1], "base64")]));
  const slide = a.state.deck.slides[0];
  press(w, d, "p");
  pointer(w, d.querySelector(".slide-frame.current canvas"), "pointerdown", { buttons: 1 });
  pointer(w, d.querySelector(".slide-frame.current canvas"), "pointermove", { buttons: 1, clientX: 400 });
  a.state.boardMeta[`${slide.id}::White`] = { color: "white", kept: false, inserted: true };
  a.state.boardMeta[`${slide.id}::Black`] = { color: "black", kept: true, inserted: true };
  a.state.boardMeta[`${slide.id}::Removed`] = { color: "white", kept: true, inserted: false };
  a.state.boards[`${slide.id}::White`] = [{ type: "diagram", id: "board-text", kind: "text", x: 60, y: 50, w: 180, h: 90,
    color: "#DC2626", fill: "transparent", width: 2, text: "Board notes", fontSize: 24 }];
  a.state.annotations[a.state.deck.slides[1].id] = [{ type: "rect", x: 30, y: 40, w: 80, h: 60, color: "#DC2626", opacity: .3 }];
  const current = a.state.currentId;
  d.querySelector("#exportPdfButton").click();
  assert.equal(d.querySelector("#exportPdfButton").disabled, true);
  for (let i = 0; i < 1000 && d.querySelector("#exportPdfButton").disabled; i++)
    await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(downloads.length, 1, d.querySelector("#toast").textContent);
  assert.equal(downloads[0].type, "application/pdf");
  const pages = await inspect(t, downloads[0], [[.8,.8], [.9,.9], [.9,.9]]);
  assert.equal(pages.length, a.state.deck.slides.length + 2);
  assert.equal(pages[0].text, originals[0].text, "original text remains extractable");
  assert.equal(pages[0].images, originals[0].images + 1, "active pen stroke is finished and overlaid");
  assert.equal(pages[1].text, "");
  assert.equal(pages[1].images, 1, "board diagram and text use the annotation renderer");
  assert.deepEqual(pages[1].pixel, [255,255,255]);
  assert.deepEqual(pages[2].pixel, [17,24,39]);
  assert.equal(pages[3].images, originals[1].images + 1, "annotations on another slide are included");
  assert.equal(pages[1].width, pages[0].width);
  assert.equal(pages[1].height, pages[0].height);
  assert.equal(a.state.currentId, current);
  assert.equal(a.state.tool, "pen");
  assert.equal(d.querySelector("#exportPdfButton").disabled, false);
});

test("PDF export commits a standalone Text draft and retains its font and active tool", async t => {
  const { a, d, w, downloads } = await exporter(t);
  const source = w.PIGEON_DECK_BUNDLE.assets[a.state.deck.pdf];
  const originals = await inspect(t, new w.Blob([Buffer.from(source.split(",")[1], "base64")]));
  press(w, d, "t");
  const canvas = d.querySelector(".slide-frame.current canvas");
  pointer(w, canvas, "pointerdown", { buttons: 1 });
  pointer(w, canvas, "pointerup");
  d.querySelector(".diagram-text-editor").value = "Exported text label";
  await a.exportPdf();
  assert.equal(downloads.length, 1, d.querySelector("#toast").textContent);
  assert.equal(d.querySelector(".diagram-text-editor"), null);
  assert.equal(a.state.tool, "text");
  const label = a.validateSession(a.sessionPayload()).annotations.intro[0];
  assert.equal(label.text, "Exported text label");
  assert.equal(label.fontFamily, "Arial");
  assert.equal(label.fontStyle, "italic");
  assert.equal(label.fontSize, 20);
  const pages = await inspect(t, downloads[0]);
  assert.equal(pages[0].text, originals[0].text);
  assert.equal(pages[0].images, originals[0].images + 1);
});

test("PDF overlays align with cropped pages at every quarter-turn rotation", async t => {
  const env = await exporter(t), { a, w, downloads } = env;
  const lib = w.PDFLib, source = await lib.PDFDocument.create();
  const angles = [0, 90, 180, 270];
  for (const angle of angles) {
    const page = source.addPage(w.eval("[420, 320]"));
    page.setCropBox(40, 30, 300, 200);
    page.setRotation(lib.degrees(angle));
    page.drawText(`Rotation ${angle}`, { x: 140, y: 120, size: 14 });
  }
  const sourceData = await source.saveAsBase64({ dataUri: true });
  const original = a.state.deck.slides[0];
  a.state.deck.slides = angles.map((angle, i) => ({ ...original, id: `rotation-${angle}`, page: i+1,
    width: angle % 180 ? 200 : 300, height: angle % 180 ? 300 : 200 }));
  a.state.currentId = a.state.deck.slides[0].id;
  w.PIGEON_DECK_BUNDLE.assets[a.state.deck.pdf] = sourceData;
  for (const slide of a.state.deck.slides) a.state.annotations[slide.id] = [
    { type: "rect", x: .1*slide.width, y: .1*slide.height, w: .2*slide.width, h: .2*slide.height, color: "#DC2626", opacity: 1 },
  ];
  await a.exportPdf();
  assert.equal(downloads.length, 1, env.d.querySelector("#toast").textContent);
  const pages = await inspect(t, downloads[0], angles.map(() => [.2,.2]));
  pages.forEach((page, i) => {
    assert.equal(page.rotation, angles[i]);
    assert.match(page.text, new RegExp(`Rotation ${angles[i]}`));
    assert.deepEqual(page.pixel, [220,38,38], `top-left overlay at ${angles[i]} degrees`);
    assert.equal(page.width, a.state.deck.slides[i].width);
    assert.equal(page.height, a.state.deck.slides[i].height);
  });
  assert.equal(w.PIGEON_DECK_BUNDLE.assets[a.state.deck.pdf], sourceData, "source PDF stays unchanged");
});

test("missing PDF data reports an error, restores the export button and allows retry", async t => {
  const { a, d, w, downloads } = await exporter(t);
  const source = w.PIGEON_DECK_BUNDLE.assets[a.state.deck.pdf];
  delete w.PIGEON_DECK_BUNDLE.assets[a.state.deck.pdf];
  await a.exportPdf();
  assert.equal(downloads.length, 0);
  assert.match(d.querySelector("#toast").textContent, /PDF export failed/);
  assert.equal(d.querySelector("#exportPdfButton").disabled, false);
  w.PIGEON_DECK_BUNDLE.assets[a.state.deck.pdf] = source;
  await a.exportPdf();
  assert.equal(downloads.length, 1);
});

test("a missing offline PDF library reports a recoverable export error", async t => {
  const { a, d, w, downloads } = await exporter(t), lib = w.PDFLib;
  // The harness disables script-file loading, exercising the real loader's error path.
  w.PDFLib = undefined;
  await a.exportPdf();
  assert.equal(downloads.length, 0);
  assert.match(d.querySelector("#toast").textContent, /PDF export library is missing/);
  assert.equal(d.querySelector("#exportPdfButton").disabled, false);
  w.PDFLib = lib;
  await a.exportPdf();
  assert.equal(downloads.length, 1);
});
