import type { PlatformArticle, PlatformQueueData, PlatformSubmitResult, PlatformSubmitState, PlatformTaskSnapshot } from "../types";
import { ipcError, isElectron } from "./transport";

const PLATFORM_DISPLAY_NAMES: Record<string, string> = { lieju: "列举网", toutiao: "头条", hepan: "蓝色河畔" };

export function getPlatformDisplayName(id: string): string { return PLATFORM_DISPLAY_NAMES[id] || id; }

export async function getPlatformQueue(): Promise<PlatformQueueData> {
  if (!isElectron()) return { platforms: [], queue: [] };
  const result = await window.desktopConsole!.platforms.getQueue();
  if (!result.ok) throw ipcError(result.error, "getPlatformQueue failed");
  const data = result.data && typeof result.data === "object" ? result.data as { revision?: number; platforms?: Array<{ id: string; scanDir: string }>; queue?: PlatformArticle[] } : {};
  return {
    revision: typeof data.revision === "number" ? data.revision : undefined,
    platforms: (data.platforms || []).map((platform) => ({ ...platform, displayName: getPlatformDisplayName(platform.id) })),
    queue: data.queue || [],
  };
}

export async function submitPlatformSelection(input: { submissions: Array<{ sourcePlatformId: string; filename: string; targetPlatformIds: string[] }>; autoTrash?: boolean }): Promise<PlatformSubmitResult> {
  if (!isElectron()) return { ok: 0, fail: 0, skipped: 0, results: [] };
  const result = await window.desktopConsole!.platforms.submitSelected(input);
  if (!result.ok) throw ipcError(result.error, "submitPlatformSelection failed");
  return result.data || { ok: 0, fail: 0, skipped: 0, results: [] };
}

export async function getPlatformState(): Promise<PlatformTaskSnapshot> {
  if (!isElectron()) return { runId: null, phase: "idle", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, uncertain: 0, currentTask: null, startedAt: null, updatedAt: null, terminalResult: null, isBatchRunning: false, isStopPending: false, isPlatformRunning: false, waitRemainingMs: 0 };
  const result = await window.desktopConsole!.platforms.getState();
  if (!result.ok) throw ipcError(result.error, "getPlatformState failed");
  return result.data || { runId: null, phase: "idle", total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, uncertain: 0, currentTask: null, startedAt: null, updatedAt: null, terminalResult: null, isBatchRunning: false, isStopPending: false, isPlatformRunning: false, waitRemainingMs: 0 };
}

export async function pausePlatformSubmit(runId?: string | null): Promise<void> {
  if (!isElectron()) return;
  const result = await window.desktopConsole!.platforms.pauseSubmit(runId);
  if (!result.ok) throw ipcError(result.error, "pausePlatformSubmit failed");
}

export async function stopPlatformSubmit(runId?: string | null): Promise<void> {
  if (!isElectron()) return;
  const result = await window.desktopConsole!.platforms.stopSubmit(runId);
  if (!result.ok) throw ipcError(result.error, "stopPlatformSubmit failed");
}

export function onPlatformState(listener: (state: PlatformSubmitState) => void): () => void {
  if (!isElectron() || typeof window.desktopConsole!.platforms?.onState !== "function") return () => {};
  return window.desktopConsole!.platforms.onState(listener);
}

export { getPlatformSettingsStatus } from "./settings";
export { previewTrashedArticleQueueResidue, cleanupTrashedArticleQueueResidue } from "./content";
