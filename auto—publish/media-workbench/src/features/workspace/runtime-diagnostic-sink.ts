export type RuntimeDiagnostic = Readonly<{
  code: string;
  category: "workspace-invalidation" | "platform-event";
}>;

import {
  getRuntimeDiagnosticsSnapshot as getSnapshot,
  reportRuntimeDiagnostic as report,
  subscribeRuntimeDiagnostics as subscribe,
} from "./runtime-diagnostic-store.js";

export function reportRuntimeDiagnostic(
  code: string,
  category: RuntimeDiagnostic["category"],
): void {
  report(code, category);
}

export function getRuntimeDiagnosticsSnapshot(): readonly RuntimeDiagnostic[] {
  return getSnapshot() as readonly RuntimeDiagnostic[];
}

export function subscribeRuntimeDiagnostics(listener: () => void): () => void {
  return subscribe(listener);
}
