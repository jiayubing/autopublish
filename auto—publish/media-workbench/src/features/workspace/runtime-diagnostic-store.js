const TOKEN = /^[A-Z][A-Z0-9_]{1,127}$/;
const CATEGORIES = new Set(["workspace-invalidation", "platform-event"]);
const listeners = new Set();
let snapshot = Object.freeze([]);

export function reportRuntimeDiagnostic(code, category) {
  if (!TOKEN.test(code) || !CATEGORIES.has(category)) return;
  snapshot = Object.freeze([
    ...snapshot.slice(-99),
    Object.freeze({ code, category }),
  ]);
  listeners.forEach((listener) => listener());
}

export function getRuntimeDiagnosticsSnapshot() {
  return snapshot;
}

export function subscribeRuntimeDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

