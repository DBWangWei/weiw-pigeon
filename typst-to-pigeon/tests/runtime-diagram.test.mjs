import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, press, pointer } from "./runtime-harness.mjs";

function at(env, type, x, y, options = {}) {
  const slide = env.a.state.deck.slides.find(
    (s) => s.id === env.a.state.currentId,
  );
  const canvas = env.d.querySelector(".slide-frame.current canvas");
  pointer(env.w, canvas, type, {
    clientX: (x / slide.width) * 1440,
    clientY: (y / slide.height) * 1000,
    buttons: type === "pointerup" ? 0 : 1,
    ...options,
  });
}
function draw(env, key, from, to, options = {}) {
  press(env.w, env.d, key, options);
  at(env, "pointerdown", ...from, options);
  at(env, "pointermove", ...to, options);
  at(env, "pointerup", ...to, options);
  return env.a.state.annotations[env.a.state.currentId].at(-1);
}
function near(a, b) {
  assert.ok(Math.abs(a - b) < 0.0001, `${a} should be close to ${b}`);
}

test("diagram shortcuts create every shape, circle, line and arrow; Escape clears selection then exits", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  assert.equal(a.state.tool, "diagram");
  assert.equal(d.querySelector("#diagramIndicator").hidden, false);
  for (const [key, kind, shiftKey] of [
    ["r", "rectangle"],
    ["d", "diamond"],
    ["o", "ellipse"],
    ["T", "triangle", true],
    ["P", "parallelogram", true],
    ["a", "arrow"],
    ["l", "line"],
  ]) {
    const o = draw(env, key, [80, 90], [240, 210], { shiftKey: !!shiftKey });
    assert.equal(o.kind, kind);
    assert.equal(a.diagram.tool, kind);
    assert.equal(
      d
        .querySelector(`[data-diagram-tool="${kind}"]`)
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.ok(d.querySelectorAll(".diagram-knob").length > 0);
    const count = a.state.annotations.intro.length;
    at(env, "pointerdown", 420, 330);
    at(env, "pointermove", 560, 450);
    at(env, "pointerup", 560, 450);
    assert.equal(a.state.annotations.intro.length, count + 1);
    assert.equal(a.state.annotations.intro.at(-1).kind, kind);
  }
  const circle = draw(env, "o", [300, 100], [450, 200], { shiftKey: true });
  near(circle.w, circle.h);
  assert.doesNotThrow(() => a.validateSession(a.sessionPayload()));
  press(w, d, "Escape");
  assert.equal(a.state.tool, "diagram");
  assert.equal(d.querySelectorAll(".diagram-selection").length, 0);
  press(w, d, "Escape");
  assert.equal(a.state.tool, "navigate");
  assert.equal(d.querySelector("#diagramIndicator").hidden, true);
});

test("committed labels remain vector text when editing ends and at deep zoom", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "d");
  const rect = draw(env, "r", [80, 90], [300, 210]);
  press(w, d, "Enter");
  const editor = d.querySelector(".diagram-text-editor");
  assert.ok(editor, "Enter edits the selected shape while its tool stays active");
  editor.value = "Sharp label";
  press(w, d, "Escape");
  let label = d.querySelector(`.diagram-label-layer [data-diagram-id="${rect.id}"]`);
  assert.ok(label, "displayed text is SVG instead of baked into canvas pixels");
  assert.equal(label.textContent, "Sharp label");
  a.zoomAt(16);
  label = d.querySelector(`.diagram-label-layer [data-diagram-id="${rect.id}"]`);
  assert.equal(label.textContent, "Sharp label");
  assert.equal(label.querySelector("text").getAttribute("font-size"), "24");
  press(w, d, "Enter");
  assert.equal(d.querySelector(`.diagram-label-layer [data-diagram-id="${rect.id}"]`).getAttribute("visibility"), "hidden");
  press(w, d, "Escape");
  assert.notEqual(d.querySelector(`.diagram-label-layer [data-diagram-id="${rect.id}"]`).getAttribute("visibility"), "hidden");
});

test("text alignment controls update SVG, editors, sessions and subsequent objects", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "d");
  const rect = draw(env, "r", [80, 90], [300, 210]);
  press(w, d, "Enter");
  d.querySelector(".diagram-text-editor").value = "Aligned";
  press(w, d, "Escape");
  const horizontal = d.querySelector("#diagramTextAlign"), vertical = d.querySelector("#diagramVerticalAlign");
  assert.ok(horizontal && vertical, "both alignment controls are available");
  for (const [h, anchor] of [["left", "start"], ["center", "middle"], ["right", "end"]]) {
    for (const v of ["top", "middle", "bottom"]) {
      horizontal.value = h; horizontal.dispatchEvent(new w.Event("change"));
      vertical.value = v; vertical.dispatchEvent(new w.Event("change"));
      assert.equal(rect.textAlign, h);
      assert.equal(rect.verticalAlign, v);
      const text = d.querySelector(`.diagram-label-layer [data-diagram-id="${rect.id}"] text`);
      assert.equal(text.getAttribute("text-anchor"), anchor);
      assert.equal(text.parentElement.dataset.verticalAlign, v);
      assert.equal(text.getAttribute("dominant-baseline"), "alphabetic");
      const saved = a.validateSession(a.sessionPayload()).annotations.intro[0];
      assert.equal(saved.textAlign, h);
      assert.equal(saved.verticalAlign, v);
    }
  }
  press(w, d, "Enter");
  assert.equal(d.querySelector(".diagram-text-editor").style.textAlign, "right");
  assert.ok(parseFloat(d.querySelector(".diagram-text-editor").style.paddingTop) > 20);
  press(w, d, "Escape");
  const next = draw(env, "o", [420, 330], [560, 450]);
  assert.equal(next.textAlign, "right");
  assert.equal(next.verticalAlign, "bottom");
  press(w, d, "z", { ctrlKey: true });
  press(w, d, "z", { ctrlKey: true });
  assert.equal(a.state.annotations.intro[0].verticalAlign, "middle");
  const invalid = a.sessionPayload();
  invalid.annotations.intro[0].textAlign = "invalid";
  assert.throws(() => a.validateSession(invalid), /Malformed diagram/);
});

test("double-click edits an existing shape without placing extra shapes in sticky mode", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "d");
  const rect = draw(env, "r", [80, 90], [300, 210]);
  for (let i = 0; i < 2; i++) {
    at(env, "pointerdown", 190, 150);
    at(env, "pointerup", 190, 150);
  }
  const canvas = d.querySelector(".slide-frame.current canvas");
  canvas.dispatchEvent(new w.MouseEvent("dblclick", { clientX: 342, clientY: 250, bubbles: true }));
  assert.equal(a.state.annotations.intro.length, 1);
  assert.ok(d.querySelector(".diagram-text-editor"));
  d.querySelector(".diagram-text-editor").value = "Edited";
  press(w, d, "Escape");
  assert.equal(rect.text, "Edited");
  assert.equal(a.diagram.tool, "rectangle");
});

test("centered labels, free text, pointer and keyboard resizing, and moves survive session validation", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  const rect = draw(env, "r", [80, 90], [240, 210]);
  press(w, d, "Enter");
  const editor = d.querySelector(".diagram-text-editor");
  assert.ok(editor);
  editor.value = "A centered label";
  editor.dispatchEvent(
    new w.KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
    }),
  );
  assert.equal(rect.text, "A centered label");
  assert.equal(d.querySelector(".diagram-text-editor"), null);
  press(w, d, "v");
  at(env, "pointerdown", 160, 150);
  at(env, "pointermove", 190, 170);
  at(env, "pointerup", 190, 170);
  near(rect.x, 110);
  near(rect.y, 110);
  at(env, "pointerdown", rect.x + rect.w, rect.y + rect.h);
  at(env, "pointermove", 310, 250);
  at(env, "pointerup", 310, 250);
  near(rect.w, 200);
  near(rect.h, 140);
  press(w, d, "ArrowRight", { ctrlKey: true, altKey: true, shiftKey: true });
  near(rect.w, 210);
  press(w, d, "ArrowDown", { shiftKey: true });
  near(rect.y, 120);
  press(w, d, "t");
  at(env, "pointerdown", 400, 300);
  at(env, "pointerup", 400, 300);
  d.querySelector(".diagram-text-editor").value = "Free text";
  press(w, d, "Escape");
  assert.equal(a.state.annotations.intro.at(-1).kind, "text");
  assert.equal(a.state.annotations.intro.at(-1).text, "Free text");
  assert.equal(
    a.validateSession(a.sessionPayload()).annotations.intro.length,
    2,
  );
});

test("free text is left/top aligned while shape labels remain centered", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  press(w, d, "t");
  at(env, "pointerdown", 120, 130);
  at(env, "pointerup", 120, 130);
  const editor = d.querySelector(".diagram-text-editor");
  assert.equal(editor.style.textAlign, "left");
  editor.value = "Free\ntext";
  press(w, d, "Escape");
  const freeText = a.state.annotations.intro.at(-1);
  const calls = [], origins = [];
  const ctx = new Proxy({
    translate(...args) { origins.push(args); },
    measureText(value) { return { width: value.length * 12 }; },
    fillText(...args) { calls.push(args); },
  }, {
    get(target, key) { return key in target ? target[key] : () => {}; },
  });
  w.PigeonDiagram.draw(ctx, freeText, [freeText]);
  assert.equal(ctx.textAlign, "left");
  assert.equal(ctx.textBaseline, "alphabetic");
  assert.deepEqual(origins[0], [130, 140]);
  assert.deepEqual(calls.map(([text, x]) => [text, x]), [["Free", 0], ["text", 0]]);
  near(calls[0][2], 19.2);
  near(calls[1][2], 49.2);

  const shape = { type: "diagram", id: "shape-label", kind: "rectangle", x: 100, y: 100,
    w: 180, h: 90, color: "#2563EB", fill: "#FACC15", text: "Shape", fontSize: 24 };
  calls.length = 0;
  w.PigeonDiagram.draw(ctx, shape, [shape]);
  assert.equal(ctx.textAlign, "center");
  assert.equal(ctx.textBaseline, "alphabetic");
  assert.deepEqual(origins[1], [190, 145]);
});

test("diagram defaults use blue strokes and yellow fills", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  const rect = draw(env, "r", [80, 90], [240, 210]);
  assert.equal(rect.color, "#2563EB");
  assert.equal(rect.fill, "#FACC15");
});

test("annotation backing resolution follows display density and diagram zoom", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  const canvas = d.querySelector(".slide-frame.current canvas");
  Object.defineProperty(w, "devicePixelRatio", { configurable: true, value: 2 });
  a.state.camera.scale = 1;
  a.drawSurface("intro");
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 1200);
  a.zoomAt(2);
  assert.equal(canvas.width, 3200);
  assert.equal(canvas.height, 2400);
  Object.defineProperty(w, "devicePixelRatio", { configurable: true, value: 1 });
  w.dispatchEvent(new w.Event("resize"));
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 1200);
  a.zoomAt(16);
  assert.ok(canvas.width <= 4096 && canvas.height <= 4096);
  assert.equal(d.querySelector('[data-frame-key="slide:portrait"] canvas').height, 850,
    "inactive pages retain their base allocation");
});

test("bound connector endpoints follow moves and resize; deleting a target safely detaches it", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  const one = draw(env, "r", [80, 90], [240, 210]),
    two = draw(env, "o", [420, 200], [560, 320]);
  const arrow = draw(env, "a", [160, 150], [490, 260]);
  assert.equal(arrow.startBinding, one.id);
  assert.equal(arrow.endBinding, two.id);
  const before = w.PigeonDiagram.endpoints(arrow, a.state.annotations.intro);
  press(w, d, "v");
  at(env, "pointerdown", 110, 115);
  at(env, "pointerup", 110, 115);
  press(w, d, "ArrowUp", { shiftKey: true });
  const after = w.PigeonDiagram.endpoints(arrow, a.state.annotations.intro);
  assert.notEqual(after[0].y, before[0].y);
  press(w, d, "ArrowRight", { ctrlKey: true, altKey: true, shiftKey: true });
  assert.notEqual(
    w.PigeonDiagram.endpoints(arrow, a.state.annotations.intro)[0].x,
    after[0].x,
  );
  press(w, d, "L", { shiftKey: true });
  assert.equal(d.querySelector("#diagramConnector").value, "straight");
  press(w, d, "Delete");
  assert.equal(arrow.startBinding, null);
  assert.equal(arrow.endBinding, two.id);
  assert.doesNotThrow(() => a.validateSession(a.sessionPayload()));
  press(w, d, "z", { ctrlKey: true });
  assert.equal(a.state.annotations.intro.length, 3);
  press(w, d, "z", { ctrlKey: true, shiftKey: true });
  assert.equal(a.state.annotations.intro.length, 2);
});

test("copy, cut, paste, duplicate and marquee selection preserve connector relationships", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  draw(env, "r", [80, 90], [240, 210]);
  draw(env, "d", [420, 200], [560, 320]);
  draw(env, "a", [160, 150], [490, 260]);
  press(w, d, "v");
  at(env, "pointerdown", 20, 20);
  at(env, "pointermove", 600, 400);
  assert.ok(d.querySelector(".diagram-marquee"));
  at(env, "pointerup", 600, 400);
  assert.equal(a.diagram.selected.length, 3);
  assert.equal(d.querySelector(".diagram-marquee"), null);
  press(w, d, "d", { metaKey: true });
  assert.equal(a.state.annotations.intro.length, 6);
  const duplicated = a.state.annotations.intro.slice(3),
    arrow = duplicated.find((o) => o.kind === "arrow");
  assert.ok(duplicated.some((o) => o.id === arrow.startBinding));
  assert.ok(duplicated.some((o) => o.id === arrow.endBinding));
  press(w, d, "x", { ctrlKey: true });
  assert.equal(a.state.annotations.intro.length, 3);
  press(w, d, "v", { ctrlKey: true });
  assert.equal(a.state.annotations.intro.length, 6);
  press(w, d, "c", { ctrlKey: true });
  press(w, d, "PageDown");
  assert.equal(a.state.currentId, "portrait");
  assert.equal(a.state.tool, "diagram");
  press(w, d, "v", { ctrlKey: true });
  assert.equal(a.state.annotations.portrait.length, 3);
  assert.doesNotThrow(() => a.validateSession(a.sessionPayload()));
  press(w, d, "Delete");
  assert.equal(a.state.annotations.portrait.length, 0);
});

test("keyboard stroke and fill palettes apply to current and subsequent shapes; toolbar remains focusable", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  const rect = draw(env, "r", [80, 90], [240, 210]);
  press(w, d, "s");
  press(w, d, "ArrowRight");
  press(w, d, "Enter");
  assert.equal(rect.color, "#DC2626");
  press(w, d, "g");
  for (let i = 0; i < 5; i++) press(w, d, "ArrowRight");
  press(w, d, "Enter");
  assert.equal(rect.fill, "#FACC15");
  const next = draw(env, "d", [420, 200], [560, 320]);
  assert.equal(next.color, rect.color);
  assert.equal(next.fill, rect.fill);
  press(w, d, "g");
  press(w, d, "Enter");
  assert.equal(next.fill, "transparent");
  const button = d.querySelector("#diagramStroke");
  button.focus();
  const tab = new w.KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
  });
  button.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
  press(w, d, "?");
  assert.equal(d.querySelector("#helpDialog").open, true);
  press(w, d, "Escape");
  assert.equal(d.querySelector("#helpDialog").open, false);
  assert.equal(a.state.tool, "diagram");
});

test("edge creation, cancellation, undo and board sessions remain valid", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  draw(env, "r", [800, 600], [800, 600]);
  press(w, d, "t");
  at(env, "pointerdown", 800, 0);
  at(env, "pointerup", 800, 0);
  press(w, d, "Escape");
  assert.doesNotThrow(() => a.validateSession(a.sessionPayload()));
  press(w, d, "r");
  at(env, "pointerdown", 10, 10);
  at(env, "pointermove", 200, 100);
  press(w, d, "Escape");
  assert.equal(a.state.annotations.intro.length, 2);
  a.toggleWhiteboard();
  press(w, d, "r");
  press(w, d, "Enter");
  assert.equal(Object.values(a.state.boards)[0].length, 1);
  press(w, d, "z", { ctrlKey: true });
  assert.equal(Object.values(a.state.boards)[0].length, 0);
  press(w, d, "z", { ctrlKey: true, shiftKey: true });
  assert.equal(Object.values(a.state.boards)[0].length, 1);
  const saved = a.validateSession(a.sessionPayload());
  a.applySession(saved);
  assert.equal(Object.values(a.state.boards)[0].length, 1);
  assert.equal(a.state.annotations.intro.length, 2);
  const malformed = structuredClone(saved);
  Object.values(malformed.boards)[0][0].w = -1;
  assert.throws(() => a.validateSession(malformed), /Malformed diagram bounds/);
});

test("PNG export renders diagrams and their labels through the shared drawing path", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  draw(env, "r", [80, 90], [240, 210]);
  press(w, d, "Enter");
  d.querySelector(".diagram-text-editor").value = "Export label";
  const renders = [],
    original = w.PigeonDiagram.draw;
  w.PigeonDiagram.draw = (ctx, op, ops) => {
    renders.push(op.text);
    original(ctx, op, ops);
  };
  let encoded = false;
  w.HTMLCanvasElement.prototype.toBlob = function (callback, type) {
    assert.equal(type, "image/png");
    assert.equal(this.width, 1600);
    encoded = true;
  };
  await a.exportPng();
  assert.equal(encoded, true);
  assert.ok(renders.includes("Export label"));
  assert.equal(d.querySelector(".diagram-text-editor"), null);
});

test("camera and overview changes finish gestures and keep the diagram mode usable", async (t) => {
  const env = await setup(t),
    { a, d, w } = env;
  press(w, d, "d");
  press(w, d, "r");
  at(env, "pointerdown", 80, 90);
  at(env, "pointermove", 240, 210);
  assert.equal(a.diagram.isDragging(), true);
  press(w, d, "+");
  assert.equal(a.diagram.isDragging(), false);
  const saved = structuredClone(a.state.annotations.intro);
  at(env, "pointermove", 300, 300);
  assert.deepEqual(structuredClone(a.state.annotations.intro), saved);
  a.openOverview();
  assert.equal(d.querySelector("#diagramToolbar").hidden, true);
  press(w, d, "Escape");
  assert.equal(a.state.tool, "diagram");
  assert.equal(d.querySelector("#diagramToolbar").hidden, false);
  assert.doesNotThrow(() => a.validateSession(a.sessionPayload()));
});
