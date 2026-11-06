import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../assets/pigeon-template/src/particle-effects.js", import.meta.url), "utf8");
const context = {};
context.window = context;
vm.runInNewContext(source, context);
const fx = context.PigeonParticleEffects;

test("particle sampling and pairing are deterministic and preserve endpoints", () => {
  const image = {
    width: 4,
    height: 4,
    data: Uint8ClampedArray.from([
      255,255,255,255, 255,255,255,255, 255,255,255,255, 255,255,255,255,
      255,255,255,255, 255,0,0,255,    255,255,255,255, 255,255,255,255,
      255,255,255,255, 255,255,255,255, 0,0,255,255, 255,255,255,255,
      255,255,255,255, 255,255,255,255, 255,255,255,255, 255,255,255,255,
    ]),
  };
  const samples = fx.sampleGrid(image, 2);
  assert.equal(samples.length, 2);
  const pairs = fx.pairParticles(samples, samples.slice().reverse());
  assert.equal(pairs.length, samples.length);
  assert.deepEqual(JSON.parse(JSON.stringify(fx.position(pairs[0], 0))), {
    x: pairs[0].from.x, y: pairs[0].from.y, scale: 1, mix: 0, opacity: pairs[0].from.opacity,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(fx.position(pairs[0], 1))), {
    x: pairs[0].to.x, y: pairs[0].to.y, scale: 1, mix: 1, opacity: pairs[0].to.opacity,
  });
  assert.equal(JSON.stringify(fx.pairParticles(samples, samples.slice().reverse())), JSON.stringify(pairs));
});
