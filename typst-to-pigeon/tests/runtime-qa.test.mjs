import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, press } from "./runtime-harness.mjs";

const qaConfig = {enabled: true, target: "_qa", model: "test-fast", maxLength: 4000, maxItems: 50};
const qaRegion = {id: "qa-area", target: "_qa", x: 40, y: 70, width: 700, height: 380};

function response(value, ok = true) {
  return {ok, json: async () => value};
}

test("Q&A trigger captures final transcript text and renders the semantic panel", async t => {
  const calls = [];
  const env = await setup(t, {
    qa: qaConfig, qaRegion,
    fetch: async (url, options) => {
      calls.push([url, options]);
      return url === "/api/voice/status" ? response({token: "qa-token"}) : response({paragraph: "The presenter explains the answer to the audience question."});
    },
  });
  const {a, d} = env;
  assert.match(a.voice.dispatch("qa-start", "manual"), /^Q&A capture started/);
  assert.equal(a.qaState.current.raw, "");
  assert.equal(d.querySelector(".pigeon-qa-panel").hidden, false);
  a.captureQaTranscript({text: "take questions now", matches: [{ruleId: "qa-start", end: 18}], fresh: []});
  assert.equal(a.qaState.current.raw, "", "a final correction of an interim trigger is not captured");
  a.captureQaTranscript({text: "Why does the estimator remain stable?"});
  assert.match(d.querySelector(".pigeon-qa-list").textContent, /Why does the estimator remain stable/);
  a.finishQaItem();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(a.qaState.items[0].status, "ready");
  assert.match(d.querySelector(".pigeon-qa-list").textContent, /explains the answer/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].headers["X-Pigeon-Voice-Token"], "qa-token");
});

test("q finalizes the current item and creates a validated white Q&A page", async t => {
  const env = await setup(t, {
    qa: qaConfig, qaRegion,
    fetch: async url => url === "/api/voice/status" ? response({token: "qa-token"}) : response({paragraph: "The answer is organized into a single paragraph."}),
  });
  const {a, d, w} = env;
  a.startQaCapture();
  a.captureQaTranscript({text: "Can the method scale to larger data?"});
  press(w, d, "q");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(a.state.whiteboard, true);
  assert.equal(a.state.boardMeta["intro::Q&A"].inserted, true);
  const ops = a.state.boards["intro::Q&A"];
  assert.equal(ops.length, 2);
  assert.match(ops[1].text, /organized into a single paragraph/);
  assert.doesNotThrow(() => a.validateSession(a.sessionPayload()));
});
