import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, press, pointer } from "./runtime-harness.mjs";

function clickAt(env, x = 100, y = 100, options = {}) {
  const slide = env.a.state.deck.slides.find(slide => slide.id === env.a.state.currentId);
  const canvas = env.d.querySelector(".slide-frame.current canvas");
  const position = { clientX: x / slide.width * 1440, clientY: y / slide.height * 1000, ...options };
  pointer(env.w, canvas, "pointerdown", { ...position, buttons: 1 });
  pointer(env.w, canvas, "pointerup", position);
  return env.d.querySelector(".diagram-text-editor");
}

function label(env, text = "A small label", x = 100, y = 100) {
  const editor = clickAt(env, x, y);
  assert.ok(editor, "clicking with Text opens the label editor");
  editor.value = text;
  press(env.w, env.d, "Enter", { ctrlKey: true });
  return env.a.state.whiteboard
    ? env.a.state.boards[`${env.a.state.currentId}::${env.a.sessionPayload().boardName}`].at(-1)
    : env.a.state.annotations[env.a.state.currentId].at(-1);
}

test("Text toolbar and T place small red Arial Italic labels without Diagram mode", async t => {
  const env = await setup(t), { a, d, w } = env;
  const button = d.querySelector('[data-tool="text"]');
  assert.ok(button, "Text is a first-class annotation tool");
  button.click();
  assert.equal(a.state.tool, "text");
  assert.ok(button.classList.contains("active"));
  assert.equal(d.querySelector("#diagramToolbar").hidden, true);
  assert.equal(d.querySelector("#diagramIndicator").hidden, true);
  assert.equal(d.querySelector(".slide-frame.current canvas").style.pointerEvents, "auto");
  const editor = clickAt(env, 120, 150);
  assert.equal(editor.style.left, "120px");
  assert.equal(editor.style.top, "150px");
  assert.equal(editor.style.fontSize, "20px");
  assert.match(editor.style.fontFamily, /Arial/);
  assert.equal(editor.style.fontStyle, "italic");
  assert.equal(editor.style.color, "#DC2626");
  editor.value = "A small label";
  press(w, d, "Escape");
  assert.equal(a.state.tool, "text");
  assert.equal(d.querySelector(".diagram-text-editor"), null);
  const saved = a.state.annotations.intro[0];
  assert.equal(saved.kind, "text");
  assert.equal(saved.fontSize, 20);
  assert.equal(saved.fontFamily, "Arial");
  assert.equal(saved.fontStyle, "italic");
  assert.equal(saved.color, "#DC2626");
  const rendered = d.querySelector(".diagram-label-layer text");
  assert.equal(rendered.getAttribute("font-family"), "Arial");
  assert.equal(rendered.getAttribute("font-style"), "italic");
  assert.equal(rendered.getAttribute("font-size"), "20");
  assert.equal(d.querySelectorAll(".diagram-selection").length, 0);
  label(env, "Another label", 400, 300);
  assert.equal(a.state.annotations.intro.length, 2);
  press(w, d, "t", { repeat: true });
  assert.equal(a.state.tool, "text");
  press(w, d, "t");
  assert.equal(a.state.tool, "navigate");
  press(w, d, "t");
  assert.equal(a.state.tool, "text");
  press(w, d, "Escape");
  assert.equal(a.state.tool, "navigate");
});

test("Text follows quick colors and swatches; typing digits does not change tools or colors", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "t");
  for (const [index, color] of ["#DC2626", "#2563EB", "#166534", "#FACC15"].entries()) {
    press(w, d, String(index + 1));
    const saved = label(env, `Color ${index + 1}`, 50 + index % 2 * 350, 100 + Math.floor(index / 2) * 200);
    assert.equal(a.state.tool, "text");
    assert.equal(saved.color, color);
  }
  d.querySelector('[data-color="#2563EB"]').click();
  assert.equal(label(env, "Swatch color", 100, 450).color, "#2563EB");
  const editor = clickAt(env, 450, 450);
  for (const key of ["1", "2", "3", "4", "p", "t"]) {
    editor.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
  }
  assert.equal(a.state.color, "#2563EB");
  assert.equal(a.state.tool, "text");
});

test("T retains its Overview and Diagram meanings and ignores other text inputs", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "o");
  const previousMode = a.state.mode;
  press(w, d, "t");
  assert.notEqual(a.state.mode, previousMode);
  assert.equal(a.state.tool, "navigate");
  a.closeOverview();
  const input = d.createElement("input");
  d.body.append(input);
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "t", bubbles: true }));
  assert.equal(a.state.tool, "navigate");
  press(w, d, "d");
  press(w, d, "t");
  assert.equal(a.state.tool, "diagram");
  assert.equal(a.diagram.tool, "text");
  assert.equal(d.querySelector("#diagramToolbar").hidden, false);
});

test("Text edits existing labels but places independent labels over shapes", async t => {
  const env = await setup(t), { a, d, w } = env;
  a.state.annotations.intro = [{ type: "diagram", id: "shape", kind: "rectangle", x: 50, y: 50,
    w: 600, h: 400, color: "#2563EB", fill: "#FACC15", text: "Shape label", fontSize: 24 }];
  a.drawSurface("intro");
  press(w, d, "t");
  const saved = label(env, "Independent label", 100, 100);
  assert.equal(a.state.annotations.intro.length, 2);
  assert.equal(a.state.annotations.intro[0].text, "Shape label");
  const editor = clickAt(env, 110, 110);
  assert.equal(editor.value, "Independent label");
  editor.value = "Edited label";
  press(w, d, "Enter", { metaKey: true });
  assert.equal(a.state.annotations.intro.length, 2);
  assert.equal(a.state.annotations.intro[1].id, saved.id);
  assert.equal(a.state.annotations.intro[1].text, "Edited label");
  press(w, d, "p");
  assert.equal(a.state.tool, "pen");
  assert.equal(d.querySelector(".diagram-text-editor"), null);
});

test("Text creation is one undo step; empty drafts leave no invisible labels", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "t");
  label(env);
  a.undo();
  assert.equal(a.state.annotations.intro.length, 0);
  a.redo();
  assert.equal(a.state.annotations.intro[0].text, "A small label");
  clickAt(env, 500, 300).value = "   ";
  press(w, d, "Escape");
  assert.equal(a.state.annotations.intro.length, 1);
  a.undo();
  assert.equal(a.state.annotations.intro.length, 0);
});

test("Text font and selected tool survive session validation and restoration", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "t");
  label(env);
  const session = a.validateSession(a.sessionPayload());
  const restored = await setup(t, { session });
  assert.equal(restored.a.state.tool, "text");
  assert.equal(restored.a.state.annotations.intro[0].fontFamily, "Arial");
  assert.equal(restored.a.state.annotations.intro[0].fontStyle, "italic");
  assert.equal(restored.d.querySelector(".diagram-label-layer text").getAttribute("font-style"), "italic");
  for (const [property, value] of [["fontFamily", "Invalid font"], ["fontStyle", "invalid"]]) {
    const malformed = structuredClone(session);
    malformed.annotations.intro[0][property] = value;
    assert.throws(() => a.validateSession(malformed), /Malformed diagram/);
  }
});

test("Text commits before navigation or tool changes, and works on boards and near page edges", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "t");
  clickAt(env).value = "Original slide";
  a.navigateTo("portrait");
  assert.equal(a.state.annotations.intro[0].text, "Original slide");
  assert.equal(a.state.tool, "text");
  clickAt(env, 250, 700).value = "Portrait label";
  a.setTool("pen");
  assert.equal(a.state.annotations.portrait[0].text, "Portrait label");
  press(w, d, "t");
  a.toggleWhiteboard();
  assert.equal(label(env, "Board label").fontStyle, "italic");
  a.toggleWhiteboard();
  const saved = label(env, "At edge", 499, 849);
  assert.ok(saved.x + saved.w <= 500);
  assert.ok(saved.y + saved.h <= 850);
  assert.doesNotThrow(() => a.validateSession(a.sessionPayload()));
});

test("Text does not intercept panning, right clicks, inactive slides or blocked surfaces", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "t");
  assert.equal(clickAt(env, 100, 100, { button: 2 }), null);
  press(w, d, " ");
  assert.equal(clickAt(env), null);
  d.querySelector("#stage").dispatchEvent(new w.KeyboardEvent("keyup", { key: " ", bubbles: true }));
  const inactive = d.querySelector('[data-frame-key="slide:portrait"] canvas');
  pointer(w, inactive, "pointerdown", { buttons: 1 });
  assert.equal(d.querySelector(".diagram-text-editor"), null);
  a.toggleBlackout();
  assert.equal(clickAt(env), null);
  a.toggleBlackout();
  d.querySelector("#helpDialog").showModal();
  assert.equal(clickAt(env), null);
});

test("Text does not inherit Diagram pan or alignment settings", async t => {
  const env = await setup(t), { a, d, w } = env;
  press(w, d, "d");
  press(w, d, "t");
  const alignment = d.querySelector("#diagramTextAlign");
  alignment.value = "right";
  alignment.dispatchEvent(new w.Event("change"));
  press(w, d, "h");
  assert.equal(a.diagram.isHand(), true);
  d.querySelector('[data-tool="text"]').click();
  assert.equal(a.diagram.isHand(), false);
  const saved = label(env);
  assert.equal(saved.textAlign, "left");
  assert.equal(saved.verticalAlign, "top");
});
