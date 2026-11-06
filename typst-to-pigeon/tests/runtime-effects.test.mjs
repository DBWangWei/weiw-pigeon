import {test} from "node:test";
import assert from "node:assert/strict";
import {setup} from "./runtime-harness.mjs";

test("effect manifest defaults and explicit destinations normalize", async t => {
  const {a, w} = await setup(t);
  const raw = structuredClone(w.PIGEON_DECK_BUNDLE.json["public/deck/manifest.json"]);
  delete raw.effects;
  assert.deepEqual(JSON.parse(JSON.stringify(a.normaliseManifest(raw).effects)), {
    particleMorph: "sections",
    particleMorphSlides: [],
    particleMorphDurationMs: 1400,
    particleMorphCell: 10,
    rackFocus: false,
  });
  raw.effects = {particleMorph: "none", particleMorphSlides: ["03"], particleMorphDurationMs: 900, particleMorphCell: 16, rackFocus: true};
  assert.deepEqual(JSON.parse(JSON.stringify(a.normaliseManifest(raw).effects)), {
    particleMorph: "none",
    particleMorphSlides: ["03"],
    particleMorphDurationMs: 900,
    particleMorphCell: 16,
    rackFocus: true,
  });
});

test("particle morph defaults to section changes and explicit slides override it", async t => {
  const {a} = await setup(t);
  const source = a.state.deck.slides.find(slide => slide.id === "intro");
  const sameSection = a.state.deck.slides.find(slide => slide.id === "portrait");
  const nextSection = a.state.deck.slides.find(slide => slide.id === "03");
  assert.equal(a.particleMorphFor(source, sameSection), false);
  assert.equal(a.particleMorphFor(source, nextSection), true);
  a.state.deck.effects = {particleMorph: "none", particleMorphSlides: ["portrait"]};
  assert.equal(a.particleMorphFor(source, sameSection), true);
  assert.equal(a.particleMorphFor(source, nextSection), false);
});

test("rack focus is off initially, toggles in Overview, and steps before navigation", async t => {
  const {a, d, w} = await setup(t);
  assert.equal(a.state.rackFocusEnabled, false);
  a.openOverview();
  const toggle = d.querySelector("#rackFocusToggle");
  assert.ok(toggle);
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  toggle.dispatchEvent(new w.Event("change", {bubbles: true}));
  assert.equal(a.state.rackFocusEnabled, true);
  a.closeOverview();
  assert.ok(d.querySelector(".rack-focus-overlay"));
  const firstIndex = a.state.rackFocusIndex;
  a.nextSlide(1);
  assert.equal(a.state.currentId, "intro");
  assert.equal(a.state.rackFocusIndex, firstIndex + 1);
  const regions = a.state.deck.slides[0].wandRegions;
  a.state.rackFocusIndex = regions.length - 1;
  a.renderRackFocus();
  a.nextSlide(1);
  assert.equal(a.state.currentId, "portrait");
});
