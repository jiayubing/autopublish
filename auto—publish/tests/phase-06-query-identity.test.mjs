import test from "node:test";
import assert from "node:assert/strict";

import {
  createQueryIdentity,
  createCommandOwner,
} from "../media-workbench/src/infrastructure/query-identity/query-identity.js";

test("newer manual and invalidation refreshes invalidate an older initial request", () => {
  const identity = createQueryIdentity({ feature: "content", query: "clients" });
  const initial = identity.begin({ workspaceRuntimeId: "w1", clientId: "a" }, "initial");
  const manual = identity.begin({ workspaceRuntimeId: "w1", clientId: "a" }, "manual");
  assert.equal(identity.isCurrent(initial), false);
  assert.equal(identity.isCurrent(manual), true);
  const invalidation = identity.begin({ workspaceRuntimeId: "w1", clientId: "a" }, "invalidation");
  assert.equal(identity.isCurrent(manual), false);
  assert.equal(identity.isCurrent(invalidation), true);
  assert.match(invalidation.key, /^content:clients:/);
});
test("scope changes and dispose fence stale successes and failures", () => {
  const identity = createQueryIdentity({ feature: "content", query: "article" });
  const a = identity.begin({ workspaceRuntimeId: "w1", articleId: "a" }, "initial");
  identity.setScope({ workspaceRuntimeId: "w1", articleId: "b" });
  assert.equal(identity.isCurrent(a), false);
  const b = identity.begin(undefined, "command-result");
  assert.equal(identity.isCurrent(b), true);
  identity.dispose();
  assert.equal(identity.isCurrent(b), false);
  assert.throws(() => identity.begin(undefined, "manual"), { code: "FEATURE_DISPOSED" });
});

test("each command owns an independent token and finalize lifecycle", () => {
  const submit = createCommandOwner({ feature: "platform", command: "submit" });
  const pause = createCommandOwner({ feature: "platform", command: "pause" });
  const scope = { workspaceRuntimeId: "w1", platformId: "hepan" };
  const submitToken = submit.begin(scope);
  const pauseToken = pause.begin(scope);
  assert.equal(submit.isCurrent(submitToken), true);
  assert.equal(pause.isCurrent(pauseToken), true);
  pause.finalize(pauseToken);
  assert.equal(submit.getSnapshot().busy, true);
  assert.equal(pause.getSnapshot().busy, false);
  submit.finalize(submitToken);
  assert.equal(submit.getSnapshot().busy, false);
});
