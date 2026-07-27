import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceFeature } from "../media-workbench/src/features/workspace/workspace-feature.js";

const selectionRequired = Object.freeze({
  state: "selection_required",
  configured: false,
  environmentManaged: false,
  label: "尚未配置工作区",
  selection: null,
  errorCode: null,
  changed: null,
});

test("workspace feature owns bootstrap/current queries and independent commands", async () => {
  const calls = [];
  let finishOpen;
  const feature = createWorkspaceFeature({
    getBootstrapState: async () => ({
      ...selectionRequired,
      state: "ready",
      configured: true,
    }),
    getCurrent: async () => ({
      ...selectionRequired,
      state: "ready",
      configured: true,
    }),
    openCurrent: () =>
      new Promise((resolve) => {
        finishOpen = resolve;
      }),
    requestSwitch: async () => ({
      ...selectionRequired,
      state: "confirmation_required",
      selection: { token: "opaque", kind: "empty_directory", label: "空目录" },
    }),
  });
  await feature.initialize();
  assert.equal(feature.getSnapshot().bootstrap.data.state, "ready");
  assert.equal(feature.getSnapshot().current.data.configured, true);
  const opening = feature.openCurrent();
  assert.equal(feature.getSnapshot().commands.openCurrent.busy, true);
  await feature.requestSwitch();
  assert.equal(feature.getSnapshot().commands.openCurrent.busy, true);
  assert.equal(feature.getSnapshot().commands.requestSwitch.busy, false);
  assert.equal(feature.getSnapshot().selection.data.selection.token, "opaque");
  finishOpen();
  await opening;
  assert.equal(feature.getSnapshot().commands.openCurrent.busy, false);
  feature.dispose();
  assert.deepEqual(calls, []);
});

test("workspace feature ignores late query and command results after dispose", async () => {
  let finishBootstrap;
  let finishChoose;
  const feature = createWorkspaceFeature({
    getBootstrapState: () =>
      new Promise((resolve) => {
        finishBootstrap = resolve;
      }),
    getCurrent: async () => selectionRequired,
    chooseDirectory: () =>
      new Promise((resolve) => {
        finishChoose = resolve;
      }),
  });
  const initial = feature.initialize();
  const choose = feature.chooseDirectory();
  feature.dispose();
  finishBootstrap({ ...selectionRequired, state: "ready" });
  finishChoose({ ...selectionRequired, state: "confirmation_required" });
  await Promise.all([initial, choose]);
  assert.equal(feature.getSnapshot().bootstrap.data, null);
  assert.equal(feature.getSnapshot().selection.data, null);
  assert.equal(feature.getSnapshot().commands.chooseDirectory.busy, false);
});

test("workspace confirmation sends exactly the opaque token", async () => {
  const inputs = [];
  const feature = createWorkspaceFeature({
    getBootstrapState: async () => selectionRequired,
    getCurrent: async () => selectionRequired,
    chooseDirectory: async () => ({
      ...selectionRequired,
      state: "confirmation_required",
      selection: {
        token: "one-use",
        kind: "nonempty_directory",
        label: "非空目录",
      },
    }),
    confirmSelection: async (input) => {
      inputs.push(input);
      return { ...selectionRequired, state: "relaunching" };
    },
  });
  await feature.initialize();
  await feature.chooseDirectory();
  await feature.confirmSelection();
  assert.deepEqual(inputs, [{ token: "one-use" }]);
});

test("workspace bootstrap failure converges to a visible safe invalid state", async () => {
  const feature = createWorkspaceFeature({
    getBootstrapState: async () => {
      throw Object.assign(new Error("private detail"), {
        code: "WORKSPACE_BOOTSTRAP_FAILED",
      });
    },
    getCurrent: async () => selectionRequired,
  });
  await feature.initialize();
  assert.equal(feature.getSnapshot().bootstrap.data.state, "invalid");
  assert.equal(
    feature.getSnapshot().bootstrap.data.errorCode,
    "WORKSPACE_BOOTSTRAP_FAILED",
  );
  assert.equal(
    feature.getSnapshot().bootstrap.query.error.code,
    "WORKSPACE_BOOTSTRAP_FAILED",
  );
});
