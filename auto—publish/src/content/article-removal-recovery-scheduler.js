// Workspace lifecycle owner for bounded removal recovery.  No timer survives
// dispose, and a tick is serialized so two local runners cannot overlap.
function createArticleRemovalRecoveryScheduler(options) {
  const value = options || {};
  if (typeof value.recover !== "function") throw new Error("ARTICLE_REMOVAL_SCHEDULER_INVALID");
  const delayMs = Number.isFinite(value.delayMs) ? Math.max(100, value.delayMs) : 1000;
  let disposed = false; let running = false; let timer = null;
  async function tick() {
    if (disposed || running) return;
    running = true;
    try { await value.recover({ isDisposed: function() { return disposed; } }); }
    catch (_) {
      const diagnostic = {
        code: "ARTICLE_REMOVAL_RECOVERY_FAILED",
        module: "article-removal-recovery",
        category: "storage",
        operationId: "article-removal-recovery",
        metadata: { outcome: "failed" },
      };
      try { if (typeof value.onDiagnostic === "function") value.onDiagnostic(diagnostic); } catch (_) {}
    } finally {
      running = false;
      if (!disposed) timer = setTimeout(tick, delayMs);
    }
  }
  return { start: function() { void tick(); }, dispose: function() { disposed = true; if (timer) clearTimeout(timer); timer = null; }, snapshot: function() { return { disposed, running }; } };
}
module.exports = { createArticleRemovalRecoveryScheduler };
