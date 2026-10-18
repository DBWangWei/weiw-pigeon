import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, press } from "./runtime-harness.mjs";

function regions(a) {
  const slide = a.state.deck.slides[0];
  slide.wandRegions = [
    { id: "words", kind: "text", x: 100, y: 100, width: 200, height: 60 },
    { id: "picture", kind: "image", x: 350, y: 100, width: 200, height: 160 },
    { id: "table", kind: "table", x: 100, y: 350, width: 200, height: 100 },
    { id: "message", kind: "takeaway", x: 350, y: 350, width: 200, height: 60 },
  ];
  a.setTool("wand");
  return slide;
}
function hover(a, slide, id) {
  const region = slide.wandRegions.find(r => r.id === id);
  a.showWand({ clientX: (region.x + region.width / 2) / slide.width * 1440,
    clientY: (region.y + region.height / 2) / slide.height * 1000 });
}

test("backtick cycles a wand object through pop-out, isolated focus, spotlight and back", async t => {
  const { a, d, w } = await setup(t), slide = regions(a);
  hover(a, slide, "words");
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "pop");
  press(w, d, "`");
  const focus = d.querySelector(".wand-focus-overlay");
  assert.ok(focus);
  assert.equal(focus.parentElement.id, "stage", "the backdrop covers the viewport, including other slides");
  assert.equal(focus.querySelector(".wand-highlight").dataset.mode, "focus");
  assert.equal(d.querySelectorAll(".wand-highlight").length, 1);
  hover(a, slide, "picture");
  assert.equal(d.querySelector(".wand-highlight").dataset.region, "words", "focused target stays fixed");
  d.querySelector("#stage").dispatchEvent(new w.Event("pointerleave"));
  assert.ok(d.querySelector(".wand-focus-overlay"), "moving outside the canvas keeps Focus visible");
  press(w, d, "`", { repeat: true });
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "focus");
  press(w, d, "`");
  assert.equal(d.querySelector(".wand-focus-overlay"), null);
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "spotlight");
  assert.ok(d.querySelector(".wand-shade"));
  hover(a, slide, "picture");
  assert.equal(d.querySelector(".wand-highlight").dataset.region, "words", "cycled Spotlight stays fixed too");
  press(w, d, "`");
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "pop");
  assert.equal(d.querySelector(".wand-shade"), null);
  hover(a, slide, "picture");
  assert.equal(d.querySelector(".wand-highlight").dataset.region, "picture", "pop-out resumes hovering");
  assert.equal(a.state.tool, "wand");
  assert.equal(a.state.stickyPen, false);
  d.querySelector("#stage").dispatchEvent(new w.Event("pointerleave"));
  assert.equal(d.querySelector(".wand-highlight"), null, "ordinary Pop-out ends on pointer leave");
});

test("takeaways start in the existing spotlight mode but can use either other mode", async t => {
  const { a, d, w } = await setup(t), slide = regions(a);
  hover(a, slide, "message");
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "spotlight");
  press(w, d, "`");
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "pop");
  assert.equal(d.querySelector(".wand-shade"), null);
  press(w, d, "`");
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "focus");
});

test("focus retains image/table artwork and Escape dismisses emphasis before exiting the wand", async t => {
  const { a, d, w } = await setup(t), slide = regions(a);
  for (const id of ["picture", "table"]) {
    hover(a, slide, id); press(w, d, "`");
    const art = d.querySelector(".wand-focus-artwork");
    assert.ok(art.style.backgroundImage.includes("data:image/svg+xml"));
    assert.equal(art.dataset.rendering, "original");
    press(w, d, "Escape");
    assert.equal(d.querySelector(".wand-highlight"), null);
    assert.equal(a.state.tool, "wand");
  }
  press(w, d, "Escape");
  assert.equal(a.state.tool, "navigate");
});

test("navigation, zoom, overview, dialogs and tool switches remove the focus view", async t => {
  for (const action of [
    ({ a }) => a.nextSlide(), ({ a }) => a.zoomAt(1.3),
    ({ a }) => a.openOverview(), ({ a }) => a.setTool("pen"),
    ({ d }) => d.querySelector("#helpButton").click(),
  ]) {
    const env = await setup(t), slide = regions(env.a);
    hover(env.a, slide, "words"); press(env.w, env.d, "`");
    action(env);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(env.d.querySelector(".wand-focus-overlay"), null);
    assert.equal(env.d.querySelector(".wand-highlight"), null);
  }
});

test("wand cycling respects typing, modifiers, reduced motion and the current session ink", async t => {
  const { a, d, w } = await setup(t), slide = regions(a);
  a.state.reducedMotion = true;
  a.state.annotations[slide.id] = [{ type: "stroke", color: "#DC2626", width: 4, points: [{x:10,y:20}] }];
  const saved = JSON.stringify(a.state.annotations);
  hover(a, slide, "words");
  const input = d.querySelector("#boardNameInput");
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "`", bubbles: true }));
  press(w, d, "`", { ctrlKey: true });
  assert.equal(d.querySelector(".wand-highlight").dataset.mode, "pop");
  press(w, d, "`");
  assert.equal(d.querySelector(".wand-highlight").style.animation, "none");
  assert.equal(JSON.stringify(a.state.annotations), saved);
});

test("late text rendering cannot restore a dismissed focus or overwrite its next target", async t => {
  const { a, d, w } = await setup(t), slide = regions(a);
  let complete;
  w.PigeonWandEffects.textArtwork = () => new Promise(resolve => { complete = resolve; });
  hover(a, slide, "words"); press(w, d, "`");
  const stale = d.querySelector(".wand-focus-artwork");
  press(w, d, "Escape");
  hover(a, slide, "picture"); press(w, d, "`");
  complete("data:image/png;base64,stale");
  await Promise.resolve();
  assert.equal(stale.isConnected, false);
  assert.equal(stale.dataset.rendering, "original");
  assert.equal(d.querySelector(".wand-highlight").dataset.region, "picture");
  assert.equal(d.querySelector(".wand-focus-artwork").dataset.rendering, "original");
});
