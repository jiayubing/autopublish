const { createWorkspaceInvalidator } = require("../workspace-invalidation-policy");

// Owns all workspace-scoped objects.  The Electron process may live through
// several workspace selections; none of these objects are safe to keep at
// module scope across that boundary.
function createWorkspaceRuntime(options) {
  const opts = options || {};
  if (typeof opts.createServices !== "function") throw new Error("Workspace runtime service factory is required");

  let phase = "idle";
  let context = null;
  let services = null;
  let invalidator = null;
  let cleanups = [];
  let startPromise = null;
  let disposePromise = null;
  let ipcRegistered = false;

  function getState() {
    return {
      phase,
      workspacePath: context && context.workspacePath || null,
      ipcRegistered,
      revision: invalidator ? invalidator.getRevision() : 0
    };
  }

  function getServices() { return services; }

  function registerIpc() {
    if (phase !== "running") throw new Error("Workspace runtime is not running");
    if (ipcRegistered) return;
    if (typeof opts.registerIpc === "function") {
      opts.registerIpc({ context, services, invalidate: invalidator.invalidate, getRevision: invalidator.getRevision });
    }
    ipcRegistered = true;
  }

  async function start(nextContext) {
    if (phase === "running") return getState();
    if (startPromise) return startPromise;
    startPromise = (async function() {
      phase = "starting";
      try {
        context = nextContext || null;
        invalidator = createWorkspaceInvalidator(opts.sendToRenderer, opts.initialRevision);
        const createdServices = opts.createServices(context, {
          invalidate: invalidator.invalidate,
          getRevision: invalidator.getRevision
        });
        services = createdServices && typeof createdServices.then === "function" ? await createdServices : createdServices;
        if (!services || typeof services !== "object") throw new Error("Workspace runtime services are required");
        if (typeof opts.subscribe === "function") {
          const subscriptions = await opts.subscribe({ context, services, invalidate: invalidator.invalidate, getRevision: invalidator.getRevision });
          cleanups = (Array.isArray(subscriptions) ? subscriptions : [subscriptions]).filter(function(value) { return typeof value === "function"; });
        }
        // Disposal can be requested while an asynchronous subscription is
        // being established.  It owns the cleanup in that case; never
        // register handlers against the released service graph.
        if (phase === "disposing" || services === null) {
          for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch (_) {} }
          cleanups = [];
          return getState();
        }
        phase = "running";
        registerIpc();
        return getState();
      } catch (error) {
        phase = "failed";
        throw error;
      } finally {
        startPromise = null;
      }
    })();
    return startPromise;
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    if (phase === "idle" || phase === "stopped") return getState();
    disposePromise = (async function() {
      phase = "disposing";
      const activeServices = services;
      const activeCleanups = cleanups;
      services = null;
      cleanups = [];
      ipcRegistered = false;
      context = null;
      try {
        for (const cleanup of activeCleanups.reverse()) {
          try { await cleanup(); } catch (_) {}
        }
        if (typeof opts.disposeServices === "function") await opts.disposeServices(activeServices);
      } finally {
        invalidator = null;
        phase = "stopped";
        disposePromise = null;
      }
      return getState();
    })();
    return disposePromise;
  }

  return { start, registerIpc, getState, getServices, dispose };
}

module.exports = { createWorkspaceRuntime };
