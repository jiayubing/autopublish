// Renderer command lifecycle only. Selection policy and publication rules stay
// behind the injected bridge/main-process boundary.
export function createPlatformSubmissionController(bridge, refresh) {
  let disposed = false;
  let state = {
    selectedArticles: new Set(),
    selectedPlatformIds: new Set(),
    submitting: false,
    stopping: false,
    pausing: false,
    error: null,
    result: null,
    showResult: false,
    requestId: 0,
    terminalRevision: null,
    residue: { phase: "idle", cleanableCount: 0, reportedCount: 0, feedback: null },
  };
  const listeners = new Set();

  function getState() { return state; }
  function update(patch) {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  function updateResidue(patch) { update({ residue: { ...state.residue, ...patch } }); }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  function begin(patch) {
    const requestId = state.requestId + 1;
    update({ ...patch, requestId });
    return requestId;
  }
  function current(requestId) { return !disposed && requestId === state.requestId; }

  function toggleArticle(key) {
    const selectedArticles = new Set(state.selectedArticles);
    if (selectedArticles.has(key)) selectedArticles.delete(key); else selectedArticles.add(key);
    update({ selectedArticles });
  }
  function togglePlatform(id) {
    const selectedPlatformIds = new Set(state.selectedPlatformIds);
    if (selectedPlatformIds.has(id)) selectedPlatformIds.delete(id); else selectedPlatformIds.add(id);
    update({ selectedPlatformIds });
  }
  function replaceArticles(keys) { update({ selectedArticles: new Set(keys) }); }
  function selectGroup(keys, allSelected) {
    const selectedArticles = new Set(state.selectedArticles);
    keys.forEach((key) => { if (allSelected) selectedArticles.delete(key); else selectedArticles.add(key); });
    update({ selectedArticles });
  }
  function pruneArticles(validKeys) {
    update({ selectedArticles: new Set([...state.selectedArticles].filter((key) => validKeys.has(key))) });
  }

  async function submit(input) {
    if (state.submitting) return { ignored: true };
    const requestId = begin({ submitting: true, stopping: false, pausing: false, error: null });
    try {
      const result = await bridge.submit(input);
      if (current(requestId)) update({ result, showResult: true, error: null });
      return result;
    } catch (error) {
      if (current(requestId)) update({ error: error instanceof Error ? error.message : "Submission failed" });
      throw error;
    } finally {
      if (current(requestId)) update({ submitting: false });
    }
  }
  async function pause(runId) {
    if (state.pausing) return { ignored: true };
    const requestId = begin({ pausing: true });
    try { return await bridge.pause(runId); }
    catch (error) { if (current(requestId)) update({ error: error instanceof Error ? error.message : "Unable to pause submission" }); throw error; }
    finally { if (current(requestId)) update({ pausing: false }); }
  }
  async function stop(runId) {
    if (state.stopping) return { ignored: true };
    const requestId = begin({ stopping: true, submitting: false, pausing: false });
    try { return await bridge.stop(runId); }
    catch (error) { if (current(requestId)) update({ error: error instanceof Error ? error.message : "Unable to stop submission" }); throw error; }
    finally { if (current(requestId)) update({ stopping: false }); }
  }
  async function refreshTerminal(revision) {
    if (!Number.isFinite(revision) || state.terminalRevision === revision || disposed) return false;
    update({ terminalRevision: revision });
    await refresh("submit-terminal");
    return true;
  }
  async function inspectResidue() {
    if (state.residue.phase === "checking" || state.residue.phase === "cleaning") return { ignored: true };
    const requestId = begin({});
    updateResidue({ phase: "checking", feedback: null });
    try {
      const report = await bridge.previewResidue();
      if (current(requestId)) updateResidue({ phase: report.cleanableCount ? "awaiting-confirmation" : "idle", cleanableCount: report.cleanableCount || 0, reportedCount: report.reportedCount || 0 });
      return report;
    } catch (error) {
      if (current(requestId)) updateResidue({ phase: "idle", feedback: { kind: "error", text: error instanceof Error ? error.message : "无法检查已删除文章队列残留" } });
      throw error;
    }
  }
  async function cleanupResidue({ confirmed } = {}) {
    if (!confirmed || state.residue.phase === "cleaning") return { ignored: true };
    const requestId = begin({});
    updateResidue({ phase: "cleaning", feedback: { kind: "status", text: "清理中…" } });
    try {
      const result = await bridge.cleanupResidue();
      if (!current(requestId)) return result;
      const report = await bridge.previewResidue();
      if (!current(requestId)) return result;
      updateResidue({ phase: "idle", cleanableCount: report.cleanableCount || 0, reportedCount: report.reportedCount || 0, feedback: residueFeedback(result, report) });
      await refresh("residue-cleanup");
      return result;
    } catch (error) {
      if (current(requestId)) updateResidue({ phase: "idle", feedback: { kind: "error", text: `已删除文章队列残留清理失败。原因：${error instanceof Error ? error.message : "清理服务返回失败"}` } });
      throw error;
    }
  }
  function setError(error) { update({ error }); }
  function dismissResult() { update({ showResult: false, result: null }); }
  function dispose() { disposed = true; listeners.clear(); }

  return Object.freeze({ getState, subscribe, dispose, setError, submit, pause, stop, refreshTerminal, inspectResidue, cleanupResidue, dismissResult, toggleArticle, togglePlatform, replaceArticles, selectGroup, pruneArticles });
}

function residueFeedback(result, report) {
  const cleanedCount = Number(result.cleanedCount) || 0;
  const failedCount = Number(result.failedCount ?? result.failedItems?.length ?? 0) || 0;
  const remainingCount = Number(result.remainingCount ?? (report.cleanableCount + report.reportedCount)) || 0;
  if (failedCount > 0 || cleanedCount === 0) return { kind: "error", text: cleanedCount > 0 ? `部分清理：已清理 ${cleanedCount} 项，仍有 ${Math.max(failedCount, remainingCount)} 项未清理。` : `未清理任何残留项。仍有 ${Math.max(failedCount, remainingCount)} 项需要处理。` };
  return { kind: "status", text: `已清理 ${cleanedCount} 项已删除源文章队列残留。` };
}
