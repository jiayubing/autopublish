import assert from "node:assert/strict";
import { it } from "node:test";
import { createPlatformSubmissionController } from "../media-workbench/src/controllers/platform-submission-controller.js";

it("platform controller ignores duplicate commands and stale submit responses", async () => {
  let resolveFirst; const calls = []; const updates = [];
  const controller = createPlatformSubmissionController({ submit(input) { calls.push(input); return new Promise((resolve) => { resolveFirst = resolve; }); }, stop() {} }, async () => {});
  const first = controller.submit({ id: 1 }, (value) => updates.push(value));
  const second = await controller.submit({ id: 2 }, (value) => updates.push(value));
  assert.deepEqual(second, { ignored: true }); assert.equal(calls.length, 1);
  resolveFirst({ ok: 1 }); await first;
  assert.equal(updates.some((value) => value.result?.ok === 1), true);
  assert.deepEqual(updates.filter((value) => value.submitting === false).length, 1);
});

it("platform controller refreshes each terminal revision once", async () => {
  const reasons = []; const controller = createPlatformSubmissionController({ submit() {}, stop() {} }, async (reason) => reasons.push(reason));
  assert.equal(await controller.refreshTerminal(3), true);
  assert.equal(await controller.refreshTerminal(3), false);
  assert.equal(await controller.refreshTerminal(4), true);
  assert.deepEqual(reasons, ["submit-terminal", "submit-terminal"]);
});

it("platform controller owns article and platform selections", () => {
  const controller = createPlatformSubmissionController({ submit() {}, stop() {} }, async () => {});
  let state = {};
  const apply = (next) => { state = next; };
  controller.toggleArticle("a", apply); controller.togglePlatform("hepan", apply);
  assert.deepEqual([...state.selectedArticles], ["a"]); assert.deepEqual([...state.selectedPlatformIds], ["hepan"]);
  controller.pruneArticles(new Set(), apply);
  assert.deepEqual([...state.selectedArticles], []);
});
