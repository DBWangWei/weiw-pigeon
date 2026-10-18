// Real SVG/canvas checks, independent of the DOM runtime's canvas stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const { createCanvas, Image, loadImage } = await import(process.env.PIGEON_CANVAS_DEPS
  ? pathToFileURL(resolve(process.env.PIGEON_CANVAS_DEPS, "@napi-rs/canvas/index.js")).href
  : "@napi-rs/canvas");
class DecodableImage extends Image {
  constructor() {
    super();
    this.decoded = new Promise((resolve, reject) => { this.onload = resolve; this.onerror = reject; });
  }
  set src(value) { super.src = Buffer.from(value.slice(value.indexOf(",") + 1), "base64"); }
  get src() { return super.src; }
  decode() { return this.decoded; }
}
const context = { window: {}, Image: DecodableImage,
  document: { createElement: () => createCanvas(1, 1) } };
vm.runInNewContext(await readFile(new URL("../assets/pigeon-template/src/wand-effects.js", import.meta.url), "utf8"), context);
const { textArtwork } = context.window.PigeonWandEffects;
const svgUrl = body => "data:image/svg+xml;base64," + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">${body}</svg>`).toString("base64");
const crop = {x: 80, y: 20, width: 80, height: 60}, slide = {width: 200, height: 100};

test("real SVG crop isolates glyph outlines on transparent paper at their original positions", async () => {
  const mask = await textArtwork(svgUrl('<path d="M100 40h4v20h-4z M112 38h3v7h-3z"/><rect x="10" y="5" width="10" height="10" fill="red"/>'), crop, slide);
  assert.ok(mask?.startsWith("data:image/png;base64,"));
  const image = await loadImage(mask), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext("2d");
  assert.equal(image.width, 160); assert.equal(image.height, 120);
  ctx.drawImage(image, 0, 0);
  const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
  assert.deepEqual(pixel(42, 44), [244, 247, 251, 255]);
  assert.deepEqual(pixel(66, 40), [244, 247, 251, 255], "small raised glyph stays in place");
  assert.equal(pixel(55, 44)[3], 0, "gap is transparent");
  assert.equal(pixel(0, 0)[3], 0, "surrounding paper is transparent");
});

test("real gradient artwork falls back intact and unreadable SVG fails gracefully", async () => {
  const gradient = '<defs><linearGradient id="bg"><stop stop-color="#112244"/><stop offset="1" stop-color="#7788aa"/></linearGradient></defs><rect width="200" height="100" fill="url(#bg)"/><path d="M100 40h4v20h-4z" fill="white"/>';
  assert.equal(await textArtwork(svgUrl(gradient), crop, slide), null);
  assert.equal(await textArtwork("data:image/svg+xml;base64,invalid", crop, slide), null);
});
