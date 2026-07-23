// Renderer-side session boundary for article management.  All bridge work is
// injected; this module deliberately has no dependency on Electron globals.
function emptyManagement() {
  return {
    articles: [], trash: [], submissionBatches: [], cancellationPlans: [],
    publicationRecords: [], workflowByArticle: {}, attention: { revision: 0, items: [], counts: { total: 0, actionable: 0 } },
    submissionPlatforms: [], revision: 0,
  };
}

export function createArticleManagementController({ loadSnapshot, cancel = null, watchRemoval: watchRemovalTransaction = null, loadRemoval = null, onSnapshot = null, onReset = null, onError = null }) {
  let clientId = '';
  let requestId = 0;
  let disposed = false;
  let removalUnsubscribe = null;
  let removalTimer = null;
  let activeCancellation = null;
  const listeners = new Set();
  let state = {
    clientId, requestId, management: emptyManagement(), selected: [], targetPlatformIds: [],
    busy: false, activeCommand: null, cancellationPending: null, cancellationRequestId: 0,
    removalTransaction: null, removalTransactionId: null, removalWatchVersion: 0,
    pendingConfirmation: null, batchFeedback: null, trashFeedback: null, trashPreview: null,
    feedback: null, error: '',
  };

  function emit() { listeners.forEach((listener) => listener(state)); }
  function patch(next) { state = { ...state, ...next }; emit(); }
  function stopRemovalWatch() {
    if (removalTimer) clearTimeout(removalTimer);
    removalTimer = null;
    removalUnsubscribe?.(); removalUnsubscribe = null;
  }
  function reset(nextClientId) {
    requestId += 1;
    stopRemovalWatch();
    activeCancellation = null;
    clientId = nextClientId || '';
    patch({ clientId, requestId, management: emptyManagement(), selected: [], busy: false, activeCommand: null, cancellationPending: null, cancellationRequestId: state.cancellationRequestId + 1, removalTransaction: null, removalTransactionId: null, removalWatchVersion: 0, pendingConfirmation: null, batchFeedback: null, trashFeedback: null, trashPreview: null, feedback: null, error: '' });
    onReset?.();
  }
  function snapshotState(snapshot) {
    const next = snapshot || {};
    return {
      articles: next.articles || [], trash: next.trash || [], submissionBatches: next.submissionBatches || [],
      cancellationPlans: next.cancellationPlans || [], publicationRecords: next.publicationRecords || [],
      workflowByArticle: next.workflowByArticle || {}, attention: next.attention || { revision: next.revision || 0, items: [], counts: { total: 0, actionable: 0 } },
      submissionPlatforms: next.submissionPlatforms || [], revision: next.revision || 0,
    };
  }
  async function refresh(nextClientId = clientId) {
    const requestedClientId = nextClientId || '';
    if (requestedClientId !== clientId) reset(requestedClientId);
    const id = ++requestId;
    patch({ requestId });
    if (!requestedClientId) return null;
    try {
      const snapshot = await loadSnapshot(requestedClientId);
      if (!disposed && id === requestId && requestedClientId === clientId) {
        patch({ management: snapshotState(snapshot), error: '' });
        onSnapshot?.(snapshot);
      }
      return snapshot;
    } catch (error) {
      if (!disposed && id === requestId && requestedClientId === clientId) { patch({ error: error instanceof Error ? error.message : '无法加载历史文章' }); onError?.(error); }
      return null;
    }
  }
  function runCancellation(input) {
    if (!cancel || !clientId) return Promise.resolve(null);
    const key = `${clientId}:${input?.batchId || ''}`;
    if (activeCancellation?.key === key) return activeCancellation.promise;
    const requestedClientId = clientId;
    const id = ++requestId;
    patch({ requestId, busy: true, activeCommand: 'cancel', cancellationPending: { clientId: requestedClientId, count: input?.count || 1 }, feedback: null, error: '' });
    const promise = Promise.resolve(cancel(input)).then(async (result) => {
      if (!disposed && id === requestId && requestedClientId === clientId) {
        await refresh(requestedClientId);
        if (!disposed && id + 1 === requestId && requestedClientId === clientId) patch({ feedback: { kind: 'status', text: '队列已刷新。' } });
      }
      return result;
    }).catch((error) => {
      if (!disposed && id === requestId && requestedClientId === clientId) patch({ feedback: { kind: 'error', text: error instanceof Error ? error.message : '撤销投稿批次失败' } });
      return null;
    }).finally(() => {
      if (!disposed && requestedClientId === clientId && activeCancellation?.key === key) patch({ busy: false, activeCommand: null, cancellationPending: null });
      if (activeCancellation?.key === key) activeCancellation = null;
    });
    activeCancellation = { key, promise };
    return promise;
  }
  function watchRemoval(transactionId, onTransaction) {
    stopRemovalWatch();
    if (!transactionId || !watchRemovalTransaction) return;
    const requestedClientId = clientId;
    patch({ removalTransactionId: transactionId });
    removalUnsubscribe = watchRemovalTransaction(transactionId, (transaction) => {
      if (!disposed && requestedClientId === clientId) { patch({ removalTransaction: transaction }); onTransaction?.(transaction); }
    });
  }
  function startRemovalWatch(transactionId, { onTerminal, onError: reportError } = {}) {
    stopRemovalWatch();
    if (!transactionId) return;
    const requestedClientId = clientId;
    const apply = (transaction) => {
      if (disposed || requestedClientId !== clientId || !transaction) return;
      patch({ removalTransaction: transaction });
      const status = transaction.status === 'pending_recovery' ? (transaction.phase === 'needs_repair' ? 'needs_repair' : 'pending_auto_recovery') : transaction.status;
      if (status === 'committed' || status === 'superseded' || status === 'needs_repair') { stopRemovalWatch(); onTerminal?.(transaction, status); }
    };
    if (watchRemovalTransaction) removalUnsubscribe = watchRemovalTransaction(transactionId, apply);
    if (!loadRemoval) return;
    const poll = async () => {
      try { const transaction = await loadRemoval(transactionId); apply(transaction); }
      catch (error) { if (!disposed && requestedClientId === clientId) reportError?.(error); }
      if (!disposed && requestedClientId === clientId && removalUnsubscribe !== null) removalTimer = setTimeout(poll, 1000);
    };
    void poll();
  }
  return Object.freeze({
    getState() { return state; }, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setClient(nextClientId) { if (nextClientId !== clientId) reset(nextClientId); }, refresh,
    setSelection(next) { patch({ selected: Array.isArray(next) ? [...new Set(next)] : [] }); }, selection() { return [...state.selected]; },
    setTargetPlatformIds(next) { patch({ targetPlatformIds: Array.isArray(next) ? [...new Set(next)] : [] }); },
    setState(next) { patch(typeof next === 'function' ? next(state) : next); },
    stopRemovalWatch,
    setFeedback(feedback) { patch({ feedback }); }, runCancellation, watchRemoval,
    clientId() { return clientId; }, dispose() { disposed = true; requestId += 1; stopRemovalWatch(); activeCancellation = null; listeners.clear(); state = { ...state, selected: [], busy: false, activeCommand: null, cancellationPending: null }; }
  });
}
