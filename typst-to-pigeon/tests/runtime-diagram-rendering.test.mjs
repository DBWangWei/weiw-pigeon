// Real canvas pixels complement the DOM runtime's canvas stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setup, press, pointer } from "./runtime-harness.mjs";

const { createCanvas, loadImage } = await import(process.env.PIGEON_CANVAS_DEPS
  ? pathToFileURL(resolve(process.env.PIGEON_CANVAS_DEPS, "@napi-rs/canvas/index.js")).href
  : "@napi-rs/canvas");

async function nativeCanvas(t) {
  const env = await setup(t), surfaces = new WeakMap();
  const surface = el => {
    if (!surfaces.has(el)) surfaces.set(el, createCanvas(el.width, el.height));
    const bitmap = surfaces.get(el);
    if (bitmap.width !== el.width) bitmap.width = el.width;
    if (bitmap.height !== el.height) bitmap.height = el.height;
    return bitmap;
  };
  env.w.HTMLCanvasElement.prototype.getContext = function() {
    return surface(this).getContext("2d");
  };
  Object.defineProperty(env.w, "devicePixelRatio", { configurable: true, value: 2 });
  env.a.state.camera.scale = 1.5;
  env.a.drawSurface("intro");
  return { ...env, surface };
}

function inkBounds(bitmap) {
  const { width, height } = bitmap;
  const pixels = bitmap.getContext("2d").getImageData(0, 0, width, height).data;
  let x = width, y = height, right = -1, bottom = -1;
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    if (!pixels[(row * width + col) * 4 + 3]) continue;
    x = Math.min(x, col); y = Math.min(y, row);
    right = Math.max(right, col); bottom = Math.max(bottom, row);
  }
  assert.ok(right >= 0, "saved text produces visible pixels");
  return { x, y, right, bottom };
}

async function vectorBitmap(d, width, height) {
  const layer = d.querySelector(".slide-frame.current .diagram-label-layer").cloneNode(true);
  layer.setAttribute("width", String(width));
  layer.setAttribute("height", String(height));
  const bitmap = createCanvas(width, height);
  bitmap.getContext("2d").drawImage(await loadImage(Buffer.from(layer.outerHTML)), 0, 0);
  return bitmap;
}

test("saved free text stays vector, renders at the top-left and stays in place on zoom", async t => {
  const { a, d, w, surface } = await nativeCanvas(t);
  const canvas = d.querySelector(".slide-frame.current canvas");
  press(w, d, "d");
  press(w, d, "t");
  pointer(w, canvas, "pointerdown", { clientX: 144, clientY: 150, buttons: 1 });
  pointer(w, canvas, "pointerup", { clientX: 144, clientY: 150 });
  d.querySelector(".diagram-text-editor").value = "Text\nNote";
  press(w, d, "Escape");
  assert.equal(d.querySelector(".diagram-text-editor"), null);
  assert.equal(a.state.annotations.intro.at(-1).text, "Text\nNote");
  assert.ok(surface(canvas).getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.every(value => value === 0),
    "display text is absent from the bitmap, avoiding a duplicate blurry label");
  let bitmap = await vectorBitmap(d, canvas.width, canvas.height), bounds = inkBounds(bitmap);
  assert.equal(bitmap.width, 2400);
  assert.equal(bitmap.height, 1800);
  assert.ok(bounds.x / 3 >= 89 && bounds.x / 3 < 100);
  assert.ok(bounds.y / 3 >= 100 && bounds.y / 3 < 115, JSON.stringify(bounds));
  assert.ok(bounds.bottom / 3 > 130 && bounds.bottom / 3 < 165);
  const before = bitmap.toBuffer("image/png");
  a.drawSurface("intro");
  assert.deepEqual((await vectorBitmap(d, canvas.width, canvas.height)).toBuffer("image/png"), before,
    "redraw neither shifts nor duplicates vector text");
  a.zoomAt(1.25);
  bitmap = await vectorBitmap(d, canvas.width, canvas.height); bounds = inkBounds(bitmap);
  assert.equal(bitmap.width, 3000);
  assert.equal(bitmap.height, 2250);
  assert.ok(bounds.x / 3.75 >= 89 && bounds.x / 3.75 < 100);
  assert.ok(bounds.y / 3.75 >= 100 && bounds.y / 3.75 < 115);
});

test("standalone Arial Italic labels render in vector and raster exports at the same size", async t => {
  const { a, d, w } = await nativeCanvas(t);
  press(w, d, "t");
  const canvas = d.querySelector(".slide-frame.current canvas");
  pointer(w, canvas, "pointerdown", { clientX: 180, clientY: 200, buttons: 1 });
  pointer(w, canvas, "pointerup", { clientX: 180, clientY: 200 });
  d.querySelector(".diagram-text-editor").value = "Arial Italic";
  press(w, d, "Enter", { ctrlKey: true });
  const op = a.state.annotations.intro[0];
  const png = createCanvas(800, 600);
  w.PigeonDiagram.draw(png.getContext("2d"), op, [op]);
  const svg = await vectorBitmap(d, 800, 600);
  const rasterBounds = inkBounds(png), vectorBounds = inkBounds(svg);
  for (const bounds of [rasterBounds, vectorBounds]) {
    assert.ok(bounds.x >= 109 && bounds.x < 120);
    assert.ok(bounds.y >= 129 && bounds.y < 145);
    assert.ok(bounds.bottom - bounds.y > 10 && bounds.bottom - bounds.y <= 25);
  }
  const normal = createCanvas(800, 600);
  w.PigeonDiagram.draw(normal.getContext("2d"), { ...op, fontStyle: "normal" }, [op]);
  assert.notDeepEqual(normal.toBuffer("image/png"), png.toBuffer("image/png"), "italic styling reaches the export renderer");
  const pixels = png.getContext("2d").getImageData(0, 0, 800, 600).data;
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value === 255 &&
    pixels[index - 3] === 220 && pixels[index - 2] === 38 && pixels[index - 1] === 38), "raster text uses annotation red");
});

test("shape labels render as vectors while shapes and pen strokes survive canvas redraw", async t => {
  const { a, d, w, surface } = await nativeCanvas(t);
  const canvas = d.querySelector(".slide-frame.current canvas");
  a.state.annotations.intro = [{ type: "diagram", id: "label", kind: "rectangle",
    x: 100, y: 100, w: 200, h: 120, color: "#2563EB", fill: "#FACC15",
    text: "Shape label", fontSize: 24 }];
  a.drawSurface("intro");
  const ctx = surface(canvas).getContext("2d");
  assert.equal(ctx.getTransform().a, 3);
  assert.equal(ctx.getTransform().d, 3);
  assert.deepEqual(Array.from(ctx.getImageData(450, 360, 1, 1).data), [250, 204, 21, 255]);
  const labels = await vectorBitmap(d, canvas.width, canvas.height);
  const text = labels.getContext("2d").getImageData(360, 450, 480, 60).data;
  assert.ok(text.some((value, i) => i % 4 === 2 && value > 220 && text[i - 2] < 100),
    "the centered SVG label renders blue pixels at display density");
  a.setTool("pen");
  pointer(w, canvas, "pointerdown", { clientX: 900, clientY: 500, buttons: 1 });
  pointer(w, canvas, "pointermove", { clientX: 1080, clientY: 500, buttons: 1 });
  a.drawSurface("intro");
  assert.deepEqual(Array.from(ctx.getImageData(1650, 900, 1, 1).data), [220, 38, 38, 255]);
  pointer(w, canvas, "pointerup", { clientX: 1080, clientY: 500 });
  assert.deepEqual(Array.from(ctx.getImageData(1650, 900, 1, 1).data), [220, 38, 38, 255]);
});

test("all alignment choices place text inside its box in SVG and PNG rendering", async t => {
  const { a, d, w } = await nativeCanvas(t);
  const op = { type: "diagram", id: "align", kind: "text", x: 80, y: 90,
    w: 220, h: 120, color: "#2563EB", fill: "#FACC15", text: "Text\nNote", fontSize: 24 };
  a.state.annotations.intro = [op];
  for (const textAlign of ["left", "center", "right"]) for (const verticalAlign of ["top", "middle", "bottom"]) {
    Object.assign(op, { textAlign, verticalAlign });
    a.drawSurface("intro");
    const png = createCanvas(800, 600);
    w.PigeonDiagram.draw(png.getContext("2d"), op, [op]);
    const svg = await vectorBitmap(d, 800, 600);
    for (const bitmap of [png, svg]) {
      const b = inkBounds(bitmap);
      assert.ok(b.x >= 89 && b.right <= 291, `${textAlign}: text stays in horizontal bounds`);
      assert.ok(b.y >= 99 && b.bottom <= 201, `${verticalAlign}: text stays in vertical bounds`);
      if (textAlign === "left") assert.ok(b.x < 100);
      if (textAlign === "center") assert.ok(b.x > 150 && b.right < 225);
      if (textAlign === "right") assert.ok(b.right > 280);
      if (verticalAlign === "top") assert.ok(b.y < 115);
      if (verticalAlign === "middle") assert.ok(b.y >= 120 && b.bottom <= 180, JSON.stringify(b));
      if (verticalAlign === "bottom") assert.ok(b.bottom > 190);
    }
  }
});
