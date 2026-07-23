// Renderer-side state boundary for article management. The bridge loader is
// injected so this controller remains independent of Electron globals.
export function createArticleManagementController({ loadSnapshot, onSnapshot, onReset, onError }) {
  let clientId = '';
  let requestId = 0;
  let selection = [];
  let disposed = false;

  function reset(nextClientId) {
    clientId = nextClientId || '';
    selection = [];
    onReset?.();
  }

  async function refresh(nextClientId = clientId) {
    const requestedClientId = nextClientId || '';
    const id = ++requestId;
    if (requestedClientId !== clientId) reset(requestedClientId);
    if (!requestedClientId) return null;
    try {
      const snapshot = await loadSnapshot(requestedClientId);
      if (!disposed && id === requestId && requestedClientId === clientId) onSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      if (!disposed && id === requestId && requestedClientId === clientId) onError?.(error);
      return null;
    }
  }

  return Object.freeze({
    setClient(nextClientId) { if (nextClientId !== clientId) reset(nextClientId); },
    refresh,
    setSelection(next) { selection = Array.isArray(next) ? [...new Set(next)] : []; },
    selection() { return [...selection]; },
    clientId() { return clientId; },
    dispose() { disposed = true; requestId += 1; selection = []; }
  });
}
