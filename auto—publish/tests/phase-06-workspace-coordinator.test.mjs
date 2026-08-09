import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { createWorkspaceCoordinator } from "../media-workbench/src/features/workspace/workspace-coordinator.js";

const require = createRequire(import.meta.url);
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

function event(overrides = {}) {
  return {
    schemaVersion: 1,
    workspaceRuntimeId: "runtime-a",
    revision: 1,
    scopes: ["contentSources"],
    reasonCode: "CONTENT_SOURCE_CHANGED",
    ...overrides,
  };
}

test("workspace coordinator owns one transport and handles revision/runtime lifecycle", () => {
  let rawListener = null;
  let unsubscribed = 0;
  const diagnostics = [];
  const calls = [];
  const coordinator = createWorkspaceCoordinator({
    subscribe: (listener) => {
      assert.equal(rawListener, null);
      rawListener = listener;
      return () => {
        unsubscribed += 1;
        rawListener = null;
      };
    },
    diagnose: (diagnostic) => diagnostics.push(diagnostic),
  });
  coordinator.register("contentSources", (input) =>
    calls.push(["contentSources", input.kind, input.revision]),
  );
  coordinator.register("orders", (input) =>
    calls.push(["orders", input.kind, input.revision]),
  );
  coordinator.start();
  assert.equal(calls.filter((entry) => entry[1] === "initial").length, 2);

  rawListener(event());
  rawListener(event());
  rawListener(event({ revision: 0 }));
  assert.equal(calls.filter((entry) => entry[1] === "invalidation").length, 1);

  rawListener(event({ revision: 3, scopes: ["contentSources"] }));
  assert.equal(calls.filter((entry) => entry[1] === "revision-gap").length, 2);
  assert.equal(diagnostics.at(-1).code, "WORKSPACE_INVALIDATION_REVISION_GAP");

  rawListener(
    event({ workspaceRuntimeId: "runtime-b", revision: 1, scopes: ["orders"] }),
  );
  assert.equal(
    calls.filter((entry) => entry[1] === "runtime-switch").length,
    2,
  );
  coordinator.dispose();
  assert.equal(unsubscribed, 1);
});

test("workspace coordinator gives attention and media one initial refresh per registration", () => {
  let rawListener;
  const calls = [];
  const coordinator = createWorkspaceCoordinator({
    subscribe: (listener) => {
      rawListener = listener;
      return () => {};
    },
  });
  coordinator.register("articleAttention", (input) =>
    calls.push(["articleAttention", input.kind]),
  );
  coordinator.register("orders", (input) => calls.push(["orders", input.kind]));
  coordinator.start();

  assert.deepEqual(calls, [
    ["articleAttention", "initial"],
    ["orders", "initial"],
  ]);
  rawListener(event({ scopes: ["articleAttention", "orders"] }));
  assert.deepEqual(calls.slice(2), [
    ["articleAttention", "invalidation"],
    ["orders", "invalidation"],
  ]);
  coordinator.dispose();
});

test("workspace coordinator consumes the production-parsed ARTICLE_SAVED event", () => {
  let rawListener;
  const refreshes = [];
  const diagnostics = [];
  const coordinator = createWorkspaceCoordinator({
    subscribe: (listener) => {
      rawListener = listener;
      return () => {};
    },
    diagnose: (diagnostic) => diagnostics.push(diagnostic),
  });
  coordinator.register("articleManagement", (input) => refreshes.push(input));
  coordinator.start();
  refreshes.length = 0;

  const contract = productionIpcRegistry.byChannel(
    "workspace:data-invalidated",
  );
  const wire = productionIpcRegistry.event(contract, {
    workspaceRuntimeId: "runtime-a",
    revision: 1,
    scopes: ["articleManagement"],
    reasonCode: "ARTICLE_SAVED",
  });
  rawListener(productionIpcRegistry.parseEvent(contract, wire));

  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].reasonCode, "ARTICLE_SAVED");
  assert.deepEqual(diagnostics, []);
});

test("workspace coordinator ignores unknown scopes and malformed events with safe diagnostics", () => {
  let rawListener;
  const diagnostics = [];
  const coordinator = createWorkspaceCoordinator({
    subscribe: (listener) => {
      rawListener = listener;
      return () => {};
    },
    diagnose: (diagnostic) => diagnostics.push(diagnostic),
  });
  let calls = 0;
  coordinator.register("orders", () => {
    calls += 1;
  });
  coordinator.start();
  const initialCalls = calls;
  rawListener(event({ scopes: ["futureScope"] }));
  rawListener({
    ...event(),
    workspaceRuntimeId: "C:\\private",
    revision: Number.NaN,
  });
  assert.equal(calls, initialCalls);
  assert.deepEqual(
    diagnostics.map((item) => item.code),
    [
      "WORKSPACE_INVALIDATION_UNKNOWN_SCOPE",
      "WORKSPACE_INVALIDATION_EVENT_REJECTED",
    ],
  );
  assert.doesNotMatch(JSON.stringify(diagnostics), /private|futureScope/);
});

test("workspace coordinator sends preload transport rejections to the structured diagnostic sink", () => {
  const diagnostics = [];
  let consume;
  const coordinator = createWorkspaceCoordinator({
    subscribe: (listener) => {
      consume = listener;
      return () => {};
    },
    diagnose: (diagnostic) => diagnostics.push(diagnostic),
  });
  coordinator.start();
  consume({ kind: "transport-diagnostic", code: "IPC_EVENT_INVALID" });
  assert.deepEqual(diagnostics, [
    {
      code: "WORKSPACE_INVALIDATION_TRANSPORT_REJECTED",
      category: "workspace-invalidation",
    },
  ]);
  coordinator.dispose();
});

test("workspace coordinator publishes the queried runtime identity before later revisions", () => {
  let rawListener;
  const refreshes = [];
  const snapshots = [];
  const coordinator = createWorkspaceCoordinator({
    subscribe: (listener) => {
      rawListener = listener;
      return () => {};
    },
  });
  coordinator.register("contentSources", (input) => refreshes.push(input));
  coordinator.subscribe(() => snapshots.push(coordinator.getSnapshot()));
  coordinator.start();
  assert.equal(
    coordinator.initialize({
      workspaceRuntimeId: "runtime-query-1",
      revision: 4,
    }),
    true,
  );
  assert.deepEqual(coordinator.getSnapshot(), {
    workspaceRuntimeId: "runtime-query-1",
    lastRevision: 4,
    scopes: ["contentSources"],
  });
  assert.equal(refreshes.at(-1).workspaceRuntimeId, "runtime-query-1");
  rawListener(event({ workspaceRuntimeId: "runtime-query-1", revision: 5 }));
  assert.equal(coordinator.getSnapshot().lastRevision, 5);
  assert.ok(snapshots.length >= 2);
});

test("workspace coordinator replays a StrictMode effect without losing its transport", () => {
  let rawListener = null;
  let subscribeCount = 0;
  let unsubscribeCount = 0;
  const refreshes = [];
  const coordinator = createWorkspaceCoordinator({
    subscribe: (listener) => {
      assert.equal(rawListener, null);
      rawListener = listener;
      subscribeCount += 1;
      return () => {
        assert.equal(rawListener, listener);
        rawListener = null;
        unsubscribeCount += 1;
      };
    },
  });

  const setupEffect = () => {
    coordinator.start();
    const unregister = coordinator.register("orders", (input) =>
      refreshes.push(input),
    );
    return () => {
      unregister();
      if (typeof coordinator.stop === "function") coordinator.stop();
      else coordinator.dispose();
    };
  };

  const firstCleanup = setupEffect();
  firstCleanup();
  assert.equal(subscribeCount, 1);
  assert.equal(unsubscribeCount, 1);

  const secondCleanup = setupEffect();
  assert.equal(subscribeCount, 2);
  assert.equal(unsubscribeCount, 1);
  rawListener(event({ scopes: ["orders"] }));
  assert.deepEqual(
    refreshes.map((input) => input.kind),
    ["initial", "initial", "invalidation"],
  );
  assert.equal(refreshes.at(-1).revision, 1);

  secondCleanup();
  assert.equal(unsubscribeCount, 2);
  coordinator.dispose();
  assert.throws(
    () => coordinator.register("orders", () => {}),
    /Workspace coordinator is disposed/,
  );
});

test("only workspace coordinator consumes the raw invalidation bridge", () => {
  const root = path.join(import.meta.dirname, "..", "media-workbench", "src");
  const matches = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:ts|tsx|js)$/.test(entry.name)) {
        const source = fs.readFileSync(file, "utf8");
        if (/onWorkspaceDataInvalidated/.test(source))
          matches.push(path.relative(root, file));
      }
    }
  };
  visit(root);
  assert.deepEqual(
    matches.sort(),
    [
      path.join("bridge", "workspace.ts"),
      path.join("features", "workspace", "workspace-coordinator-context.tsx"),
    ].sort(),
  );
});
