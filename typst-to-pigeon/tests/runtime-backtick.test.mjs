import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, press, pointer } from "./runtime-harness.mjs";

const settle = () => new Promise(resolve => setTimeout(resolve, 360));
const doubleTap = (w, d) => { press(w, d, "`"); press(w, d, "`"); };

test("double backtick undoes exactly one pen stroke without briefly enabling Pen down", async t => {
  const { a, d, w } = await setup(t);
  press(w, d, "p");
  const canvas = d.querySelector(".slide-frame.current canvas");
  for (const clientX of [200, 400]) {
    pointer(w, canvas, "pointerdown", { buttons: 1, clientX });
    pointer(w, canvas, "pointermove", { buttons: 1, clientX: clientX + 40 });
    pointer(w, canvas, "pointerup");
  }
  press(w, d, "`");
  assert.equal(a.state.stickyPen, false, "first tap waits for a possible second tap");
  pointer(w, canvas);
  assert.equal(a.state.currentStroke, null, "no accidental ink between taps");
  press(w, d, "`", { repeat: true });
  assert.equal(a.state.annotations.intro.length, 2, "holding the key is not a double tap");
  press(w, d, "`");
  assert.equal(a.state.annotations.intro.length, 1);
  assert.equal(a.state.tool, "pen");
  assert.equal(a.state.stickyPen, false);
  await settle();
  assert.equal(a.state.stickyPen, false, "the cancelled single tap cannot fire later");
  press(w, d, "z", { ctrlKey: true, shiftKey: true });
  assert.equal(a.state.annotations.intro.length, 2, "double-tap undo preserves redo");
});

test("double backtick removes an active sticky stroke and keeps Pen down enabled", async t => {
  const { a, d, w } = await setup(t);
  press(w, d, "p"); press(w, d, "`"); await settle();
  assert.equal(a.state.stickyPen, true);
  const canvas = d.querySelector(".slide-frame.current canvas");
  pointer(w, canvas);
  pointer(w, canvas, "pointermove", { clientX: 400 });
  doubleTap(w, d);
  assert.equal(a.state.annotations.intro.length, 0);
  assert.equal(a.state.currentStroke, null);
  assert.equal(a.state.stickyPen, true);
  assert.equal(d.querySelector("#penDownIndicator").hidden, false);
  pointer(w, canvas);
  assert.equal(a.state.currentStroke.points.length, 1, "drawing resumes as a new stroke");
  press(w, d, "`"); await settle();
  assert.equal(a.state.stickyPen, false, "a separate single tap still lifts the pen");
  assert.equal(a.state.tool, "pen");
  assert.equal(a.state.annotations.intro.length, 1);
});

test("double backtick undoes diagram placement, movement and duplication on the current surface", async t => {
  const { a, d, w } = await setup(t);
  press(w, d, "d"); press(w, d, "r"); press(w, d, "Enter");
  const originalX = a.state.annotations.intro[0].x;
  press(w, d, "ArrowRight");
  doubleTap(w, d);
  assert.equal(a.state.annotations.intro[0].x, originalX);
  press(w, d, "d", { ctrlKey: true });
  assert.equal(a.state.annotations.intro.length, 2);
  doubleTap(w, d);
  assert.equal(a.state.annotations.intro.length, 1);
  assert.equal(a.state.tool, "diagram");
  a.toggleWhiteboard();
  press(w, d, "o"); press(w, d, "Enter");
  doubleTap(w, d);
  assert.equal(Object.values(a.state.boards)[0].length, 0);
  assert.equal(a.state.annotations.intro.length, 1, "board undo leaves slide ink intact");
  press(w, d, "z", { ctrlKey: true, shiftKey: true });
  assert.equal(Object.values(a.state.boards)[0].length, 1);
});

test("double backtick finishes and undoes an in-progress diagram gesture", async t => {
  const { a, d, w } = await setup(t);
  press(w, d, "d"); press(w, d, "r");
  const canvas = d.querySelector(".slide-frame.current canvas");
  pointer(w, canvas, "pointerdown", { buttons: 1 });
  pointer(w, canvas, "pointermove", { buttons: 1, clientX: 400 });
  doubleTap(w, d);
  pointer(w, canvas, "pointerup");
  assert.equal(a.state.annotations.intro.length, 0);
  assert.equal(a.state.tool, "diagram");
});

test("backtick stays literal in diagram text and modified keys do not toggle Pen down", async t => {
  const { a, d, w } = await setup(t);
  press(w, d, "p");
  press(w, d, "~", { code: "Backquote", shiftKey: true });
  await settle();
  assert.equal(a.state.stickyPen, false);
  press(w, d, "`", { altKey: true });
  await settle();
  assert.equal(a.state.stickyPen, false);
  press(w, d, "d"); press(w, d, "t"); press(w, d, "Enter");
  const editor = d.querySelector(".diagram-text-editor");
  for (let i = 0; i < 2; i++) {
    const event = new w.KeyboardEvent("keydown", { key: "`", bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(a.state.annotations.intro.length, 1);
});

test("pending backtick toggles are cancelled when the drawing context changes", async t => {
  for (const action of [
    ({ a }) => a.setTool("diagram"),
    ({ a }) => a.nextSlide(),
    ({ d }) => d.querySelector("#helpButton").click(),
    ({ a }) => a.openOverview(),
    ({ w }) => w.dispatchEvent(new w.Event("blur")),
  ]) {
    const env = await setup(t);
    press(env.w, env.d, "p"); press(env.w, env.d, "`");
    action(env);
    await settle();
    assert.equal(env.a.state.stickyPen, false, "no delayed pen activation in a different context");
    assert.equal(env.d.querySelector("#penDownIndicator").hidden, true);
  }
});
