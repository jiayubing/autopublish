// Renderer command lifecycle only.  Selection policy and publication rules
// remain in the bridge/main process; this model merely rejects duplicate or
// stale UI commands.
export function createPlatformSubmissionController(bridge, refresh) {
  let requestId = 0;
  let submitting = false;
  let stopping = false;
  let terminalRevision = null;
  let selectedArticles = new Set();
  let selectedPlatformIds = new Set();
  function selections(apply) {
    apply({ selectedArticles: new Set(selectedArticles), selectedPlatformIds: new Set(selectedPlatformIds) });
  }
  function toggleArticle(key, apply) {
    if (selectedArticles.has(key)) selectedArticles.delete(key); else selectedArticles.add(key);
    selections(apply);
  }
  function togglePlatform(id, apply) {
    if (selectedPlatformIds.has(id)) selectedPlatformIds.delete(id); else selectedPlatformIds.add(id);
    selections(apply);
  }
  function replaceArticles(keys, apply) { selectedArticles = new Set(keys); selections(apply); }
  function selectGroup(keys, allSelected, apply) {
    keys.forEach((key) => { if (allSelected) selectedArticles.delete(key); else selectedArticles.add(key); }); selections(apply);
  }
  function pruneArticles(validKeys, apply) {
    selectedArticles = new Set([...selectedArticles].filter((key) => validKeys.has(key))); selections(apply);
  }
  async function submit(input, apply) {
    if (submitting) return { ignored: true };
    submitting = true;
    const id = ++requestId;
    apply({ submitting: true, error: null });
    try {
      const result = await bridge.submit(input);
      if (id === requestId) apply({ result, showResult: true, error: null });
      return result;
    } catch (error) {
      if (id === requestId) apply({ error: error instanceof Error ? error.message : "Submission failed" });
      throw error;
    } finally {
      // A command acceptance/result is not the authoritative terminal state.
      // The main-process terminal revision below owns the one queue refresh.
      if (id === requestId) { submitting = false; stopping = false; apply({ submitting: false, stopping: false }); }
    }
  }
  async function stop(runId, apply) {
    if (stopping) return { ignored: true };
    stopping = true; apply({ stopping: true });
    try { return await bridge.stop(runId); } finally { stopping = false; apply({ stopping: false }); }
  }
  async function refreshTerminal(revision) {
    if (!Number.isFinite(revision) || terminalRevision === revision) return false;
    terminalRevision = revision; await refresh("submit-terminal"); return true;
  }
  async function inspectResidue() { return bridge.previewResidue(); }
  async function cleanupResidue() { return bridge.cleanupResidue(); }
  return Object.freeze({ submit, stop, refreshTerminal, inspectResidue, cleanupResidue, toggleArticle, togglePlatform, replaceArticles, selectGroup, pruneArticles, get busy() { return submitting || stopping; } });
}
