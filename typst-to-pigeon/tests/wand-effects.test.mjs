import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(await readFile(new URL("../assets/pigeon-template/src/wand-effects.js", import.meta.url), "utf8"), context);
const { textMask } = context.window.PigeonWandEffects;

function paper(background = [255, 255, 255]) {
  const width = 120, height = 60, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...background, 255], i);
  return { width, height, data };
}
function paint(image, x, y, width, height, color) {
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++)
    image.data.set([...color, 255], (py * image.width + px) * 4);
}

test("a uniform paper crop becomes off-white ink without moving or filling gaps between glyphs", () => {
  const image = paper();
  paint(image, 20, 20, 3, 20, [0, 0, 0]);
  paint(image, 23, 20, 1, 20, [127, 127, 127]);
  paint(image, 30, 22, 2, 8, [0, 0, 0]); // separate superscript
  const original = image.data.slice(), mask = textMask(image);
  assert.ok(mask);
  const alpha = (x, y) => mask[(y * image.width + x) * 4 + 3];
  assert.equal(alpha(20, 20), 255);
  assert.ok(alpha(23, 20) > 110 && alpha(23, 20) < 145, "edge antialiasing survives");
  assert.equal(alpha(27, 24), 0, "spacing remains transparent");
  assert.equal(alpha(30, 22), 255, "small equation glyphs are preserved");
  assert.equal(alpha(0, 0), 0, "paper is removed");
  assert.deepEqual(Array.from(mask.slice((20 * image.width + 20) * 4, (20 * image.width + 20) * 4 + 3)), [244, 247, 251]);
  assert.deepEqual(image.data, original, "the source pixels remain untouched");
});

test("light ink on uniform dark paper is isolated too", () => {
  const image = paper([20, 28, 42]);
  paint(image, 30, 20, 3, 20, [244, 247, 251]);
  const mask = textMask(image);
  assert.ok(mask);
  assert.equal(mask[3], 0);
  assert.equal(mask[(20 * image.width + 30) * 4 + 3], 255);
});

test("mixed backgrounds, broad graphic fills, blank and faint crops retain their original artwork", () => {
  const mixed = paper();
  paint(mixed, 0, 0, 20, 60, [200, 220, 240]);
  paint(mixed, 40, 20, 3, 20, [0, 0, 0]);
  const graphic = paper(); paint(graphic, 15, 10, 90, 40, [0, 0, 0]);
  const faint = paper(); paint(faint, 30, 20, 3, 20, [240, 240, 240]);
  for (const crop of [mixed, graphic, paper(), faint]) assert.equal(textMask(crop), null);
});
