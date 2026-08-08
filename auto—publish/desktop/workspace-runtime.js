"use strict";

const {
  createWorkspaceDataInvalidation,
} = require("./workspace-data-invalidation");
const {
  createWorkspaceStartupComposition,
} = require("./composition/workspace-startup-composition");
const { reportDiagnostic } = require("../src/diagnostics/diagnostic-producer");

function required(value, name) {
  if (!value) throw new Error("Workspace runtime requires " + name);
  return value;
}

function reportWorkspaceDiagnostic(code, operation) {
  reportDiagnostic({
    code,
    module: "workspace-runtime",
    category: "lifecycle",
    operationId: operation || "workspace-runtime",
    metadata: { action: operation || "lifecycle" },
  });
}

// The runtime is the single workspace lifecycle owner. Construction and
// domain wiring live in workspace-runtime-composition; this module only
// transitions state, installs IPC once, and releases resources in reverse
// order.
function createWorkspaceRuntime(deps) {
  const options = deps || {};
  required(options.ipcMain, "ipcMain");
  required(options.sendToRenderer, "sendToRenderer");
  required(options.safeStorage, "safeStorage");

  let state = "idle";
  let bootstrap = null;
  let runtime = null;
  let composition = null;
  let modules = null;
  let ipcDeps = null;
  let ipc = null;
  let startPromise = null;
  let disposePromise = null;
  let lifecycleGeneration = 0;
  const invalidation = createWorkspaceDataInvalidation({
    sendToRenderer: options.sendToRenderer,
  });

  function current(name) {
    return (modules && modules[name]) || null;
  }

  function taskState() {
    const service = current("taskService");
    return service && service.getState ? service.getState() : null;
  }

  function collectionState() {
    const service = current("doubaoCollectionService");
    return service && service.getQueueState ? service.getQueueState() : null;
  }

  function generationState() {
    const service = current("contentGenerationBatchService");
    return service && service.getState ? service.getState() : null;
  }

  async function start(bootstrapState) {
    if (state === "running") return getState();
    if (disposePromise)
      return disposePromise.then(function () {
        return start(bootstrapState);
      });
    if (startPromise) return startPromise;
    const generation = ++lifecycleGeneration;
    startPromise = (async function () {
      state = "starting";
      try {
        const compositionInput = {
          options,
          sendToRenderer: options.sendToRenderer,
          bootstrapState,
          invalidation,
        };
        const nextComposition = options.createWorkspaceRuntimeComposition
          ? await options.createWorkspaceRuntimeComposition(compositionInput)
          : await createWorkspaceStartupComposition(compositionInput);
        if (generation !== lifecycleGeneration) {
          if (
            nextComposition &&
            typeof nextComposition.dispose === "function"
          ) {
            try {
              await nextComposition.dispose();
            } catch (_) {
              reportWorkspaceDiagnostic(
                "WORKSPACE_COMPOSITION_DISPOSE_FAILED",
                "stale-start-dispose",
              );
            }
          }
          return getState();
        }
        composition = nextComposition;
        runtime = composition.runtime;
        modules = composition.modules;
        ipcDeps = composition.ipcDeps;
        bootstrap = bootstrapState || null;
        state = "running";
        return getState();
      } catch (error) {
        if (generation === lifecycleGeneration) {
          state = "failed";
          await dispose();
        }
        throw error;
      } finally {
        startPromise = null;
      }
    })();
    return startPromise;
  }

  async function releaseResources() {
    if (ipc && typeof ipc.dispose === "function") {
      try {
        await ipc.dispose();
      } catch (_) {
        reportWorkspaceDiagnostic(
          "WORKSPACE_IPC_DISPOSE_FAILED",
          "ipc-dispose",
        );
      }
    }
    ipc = null;
    if (composition && typeof composition.dispose === "function") {
      try {
        await composition.dispose();
      } catch (_) {
        reportWorkspaceDiagnostic(
          "WORKSPACE_COMPOSITION_DISPOSE_FAILED",
          "composition-dispose",
        );
      }
    }
    composition = null;
    modules = null;
    ipcDeps = null;
    runtime = null;
    bootstrap = null;
    state = "stopped";
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    if (state === "idle" || state === "stopped") return getState();
    const pendingStart = state === "starting" ? startPromise : null;
    ++lifecycleGeneration;
    disposePromise = (async function () {
      state = "disposing";
      if (pendingStart) {
        try {
          await pendingStart;
        } catch (_) {
          reportWorkspaceDiagnostic(
            "WORKSPACE_START_FAILED_DURING_DISPOSE",
            "pending-start",
          );
        }
      }
      await releaseResources();
      disposePromise = null;
      return getState();
    })();
    return disposePromise;
  }

  function registerIpc() {
    if (state !== "running" || !ipcDeps)
      throw new Error("Workspace runtime is not started");
    if (ipc) return ipc;
    ipc = require("./ipc/register").registerIpc(ipcDeps);
    return ipc;
  }

  function getState() {
    return {
      phase: state,
      workspacePath: (bootstrap && bootstrap.workspacePath) || null,
      revision: invalidation.getRevision(),
      task: taskState(),
      collection: collectionState(),
      generation: generationState(),
    };
  }

  return { start, registerIpc, getState, dispose };
}

module.exports = { createWorkspaceRuntime };
