import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Info, RefreshCw } from 'lucide-react';
import { cancelWorkspaceSelection, confirmWorkspaceSelection, getCurrentWorkspace, getRuntimeDiagnostics, openCurrentWorkspace, requestWorkspaceSwitch, runBrowserSelfCheck } from '../electron-api';
import type { RuntimeCapability, RuntimeDiagnostics } from '../electron-api';
import { WorkspaceBootstrapState, WorkspaceConfirmationResult, WorkspaceCurrent } from '../types';
import { getSettingsCommandState } from '../workspace-ui-logic.js';
import { mapRuntimeCapabilityState } from '../runtime-capability-state.cjs';
import AiProviderSettings from './AiProviderSettings';
import WorkspaceSelectionPanel from './WorkspaceSelectionPanel';

// Compatibility notes retained for the renderer contract: 褰撳墠宸ヤ綔鍖虹敱鐜鍙橀噺鎺у埗 and 涓嶄細鍥犳枃浠舵柊澧炴垨棰勬閫氳繃鑰岃嚜鍔ㄦ姇绋?

const READY_STATE: WorkspaceBootstrapState = { state: 'ready', workspacePath: null, envOverride: false };

type StorageUsageCategory = { bytes: number; files: number; followedSymlinks?: number };
type StorageUsage = { logs: StorageUsageCategory; temporary: StorageUsageCategory; docxCache: StorageUsageCategory; profiles: StorageUsageCategory; active?: boolean };
type StorageMaintenanceApi = {
  getUsage: () => Promise<{ ok: boolean; data?: StorageUsage; error?: { message?: string } }>;
  cleanCaches: () => Promise<{ ok: boolean; data?: { blocked?: boolean }; error?: { message?: string } }>;
};

function getStorageMaintenanceApi(): StorageMaintenanceApi | null {
  const value = typeof window !== 'undefined'
    ? (window as unknown as { desktopConsole?: { storageMaintenance?: StorageMaintenanceApi } }).desktopConsole?.storageMaintenance
    : undefined;
  return value || null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function validationLabel(kind?: string): string {
  if (kind === 'existing_workspace') return '\u5df2\u6709\u5de5\u4f5c\u533a\uff0c\u6807\u8bb0\u6709\u6548';
  if (kind === 'empty_directory') return '\u7a7a\u76ee\u5f55\uff0c\u53ef\u521d\u59cb\u5316';
  if (kind === 'nonempty_directory') return '\u975e\u7a7a\u76ee\u5f55\uff0c\u9700\u786e\u8ba4\u521d\u59cb\u5316';
  return '\u672a\u8bfb\u53d6\u5230\u9a8c\u8bc1\u72b6\u6001';
}

function safeErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  if (code === 'WORKSPACE_ENV_OVERRIDE') return '\u5f53\u524d\u5de5\u4f5c\u533a\u7531\u73af\u5883\u53d8\u91cf\u63a7\u5236\uff0c\u4e0d\u80fd\u5728\u6b64\u66f4\u6362\u3002';
  if (code === 'WORKSPACE_OPEN_FAILED') return '\u65e0\u6cd5\u6253\u5f00\u5f53\u524d\u5de5\u4f5c\u533a\u3002';
  if (code === 'WORKSPACE_SWITCH_BUSY') return '\u5f53\u524d\u6709\u4efb\u52a1\u6b63\u5728\u8fd0\u884c\uff0c\u6682\u65f6\u4e0d\u80fd\u5207\u6362\u5de5\u4f5c\u533a\u3002';
  return '\u5de5\u4f5c\u533a\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002';
}

function capabilityClass(capability: RuntimeCapability): string {
  const tone = mapRuntimeCapabilityState(capability).tone;
  if (tone === 'ready') return 'text-emerald-700';
  if (tone === 'unavailable') return 'text-rose-700';
  if (tone === 'optional') return 'text-slate-500';
  return 'text-amber-700';
}

export default function SettingsView() {
  const [current, setCurrent] = useState<WorkspaceCurrent | null>(null);
  const [loading, setLoading] = useState(true);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchState, setSwitchState] = useState<WorkspaceBootstrapState>(READY_STATE);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageCleaning, setStorageCleaning] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeChecking, setRuntimeChecking] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const currentWorkspaceRequestRef = useRef<Promise<WorkspaceCurrent> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const refreshStorageUsage = async () => {
    const api = getStorageMaintenanceApi();
    if (!api) { setStorageLoading(false); return; }
    setStorageLoading(true);
    try {
      const result = await api.getUsage();
      if (!result.ok || !result.data) throw new Error(result.error?.message || 'Unable to read storage usage');
      setStorageUsage(result.data); setStorageError(null);
    } catch (error) { setStorageError(error instanceof Error ? error.message : 'Unable to read storage usage'); }
    finally { setStorageLoading(false); }
  };

  useEffect(() => { void refreshStorageUsage(); }, []);
  useEffect(() => {
    let active = true;
    getRuntimeDiagnostics().then((value) => { if (active) setRuntimeDiagnostics(value); })
      .catch((error) => { if (active) setRuntimeError(error instanceof Error ? error.message : 'Unable to read runtime status'); })
      .finally(() => { if (active) setRuntimeLoading(false); });
    return () => { active = false; };
  }, []);

  const handleRuntimeSelfCheck = async () => {
    if (runtimeChecking) return;
    setRuntimeChecking(true); setRuntimeError(null);
    try { await runBrowserSelfCheck(); setRuntimeDiagnostics(await getRuntimeDiagnostics()); }
    catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Browser self-check failed');
      try { setRuntimeDiagnostics(await getRuntimeDiagnostics()); } catch (_) { /* keep error */ }
    } finally { setRuntimeChecking(false); }
  };

  useEffect(() => {
    let active = true;
    const request = currentWorkspaceRequestRef.current || (currentWorkspaceRequestRef.current = getCurrentWorkspace());
    request.then((workspace) => {
      if (!active) return;
      setCurrent(workspace);
      setSwitchState({ state: 'ready', workspacePath: workspace.workspacePath, envOverride: workspace.envOverride });
    }).catch((error) => { if (active) setOperationError(safeErrorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const envOverride = current?.envOverride === true;
  const commandState = getSettingsCommandState({ loading, switchBusy, current, switchState });
  const handleOpen = async () => { setOperationError(null); try { await openCurrentWorkspace(); } catch (error) { if (mountedRef.current) setOperationError(safeErrorMessage(error)); } };
  const handleRequestSwitch = async (): Promise<WorkspaceBootstrapState> => {
    const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function' || window.confirm('Switching the workspace restarts the app. Continue?');
    if (!confirmed) return { state: 'ready', workspacePath: current?.workspacePath || null, envOverride };
    setOperationError(null); return requestWorkspaceSwitch();
  };
  const handleSwitchStateChange = (nextState: WorkspaceBootstrapState) => { setSwitchState(nextState); if (nextState.state === 'relaunching') setSwitchOpen(true); };
  const handleCleanCaches = async () => {
    const api = getStorageMaintenanceApi();
    if (!api || storageCleaning || storageUsage?.active) return;
    setStorageCleaning(true);
    try {
      const result = await api.cleanCaches();
      if (!result.ok) throw new Error(result.error?.message || 'Cache cleanup failed');
      if (result.data?.blocked) throw new Error('Cache cleanup is unavailable while a task is active');
      await refreshStorageUsage();
    } catch (error) { setStorageError(error instanceof Error ? error.message : 'Cache cleanup failed'); }
    finally { setStorageCleaning(false); }
  };

  const currentPath = current?.workspacePath || 'No workspace path';
  const runtimeItems: Array<[string, RuntimeCapability]> = runtimeDiagnostics ? [
    ['Playwright Node', runtimeDiagnostics.capabilities.playwrightNode],
    ['Playwright CLI', runtimeDiagnostics.capabilities.playwrightCli],
    ['Edge/Chrome', runtimeDiagnostics.capabilities.browserChannel],
    ['Built-in DOCX parsing', runtimeDiagnostics.capabilities.docx],
    ['Hepan publishing', runtimeDiagnostics.capabilities.hepan],
  ] : [];

  return (
    <div className="max-w-3xl space-y-5">
      <div><h2 className="text-lg font-bold text-slate-800">Workspace settings</h2><p className="mt-1 text-xs text-slate-500">Workspace and runtime status are supplied by the main process.</p></div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FolderOpen className="h-4 w-4" /> Current workspace</h3>
        <div className="break-all rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700" aria-label="Current workspace path">{loading ? 'Reading...' : currentPath}</div>
        <div className="text-xs text-slate-600">Validation: {loading ? 'Checking...' : validationLabel(current?.validation?.kind)}</div>
        {envOverride && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Workspace is controlled by AUTO_PUBLISH_WORKSPACE and cannot be changed here.</div>}
        {operationError && <p className="text-sm text-red-700">{operationError}</p>}
        <div className="flex flex-wrap gap-3"><button type="button" onClick={handleOpen} disabled={commandState.openDisabled} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><ExternalLink className="h-4 w-4" /> Open folder</button><button type="button" onClick={() => setSwitchOpen(true)} disabled={commandState.switchDisabled} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Change workspace</button></div>
      </section>
      {switchOpen && !envOverride && <WorkspaceSelectionPanel state={switchState} onChooseDirectory={handleRequestSwitch} onConfirmSelection={async (input): Promise<WorkspaceConfirmationResult> => confirmWorkspaceSelection(input)} onCancelSelection={cancelWorkspaceSelection} onStateChange={handleSwitchStateChange} onBusyChange={setSwitchBusy} title="Change workspace" description="The main process checks the new directory before restarting the app." />}
      <section className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800"><Info className="h-4 w-4 shrink-0" /><span>Workspace switching does not copy, move, or delete the original data.</span></section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-700">Runtime self-check</h3><p className="mt-1 text-xs text-slate-500">Playwright uses bundled Node/CLI; the browser check only opens temporary about:blank and closes it afterward.</p></div><button type="button" onClick={() => void handleRuntimeSelfCheck()} disabled={runtimeLoading || runtimeChecking} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{runtimeChecking ? 'Checking...' : 'Run browser self-check'}</button></div>
        {runtimeError && <p className="text-xs text-red-700">{runtimeError}</p>}
        <div className="grid gap-2 sm:grid-cols-2">{runtimeItems.map(([label, item]) => { const state = mapRuntimeCapabilityState(item); return <div key={label} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-700">{label}</span><span className={capabilityClass(item)}>{state.label}</span></div>; })}</div>
        {runtimeDiagnostics?.capabilities.browserChannel.state === 'not_checked' && <p className="text-xs text-amber-700">The configured browser channel has not been checked. Run the self-check before browser publishing.</p>}
        {runtimeDiagnostics?.errors.some((error) => error.code === 'PLAYWRIGHT_NODE_UNAVAILABLE' || error.code === 'PLAYWRIGHT_CLI_UNAVAILABLE' || error.code === 'BROWSER_CHANNEL_UNAVAILABLE' || error.code === 'BROWSER_CHANNEL_INVALID') && <p className="text-xs text-amber-700">Reinstall the app or choose an available Edge/Chrome channel.</p>}
        {runtimeDiagnostics?.buildInfo && <p className="text-xs text-slate-500">Build {runtimeDiagnostics.buildInfo.version} | commit {runtimeDiagnostics.buildInfo.commit} | {runtimeDiagnostics.buildInfo.dirty ? 'dirty' : 'clean'}</p>}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-700">Runtime storage</h3><p className="mt-1 text-xs text-slate-500">Only expired logs, temporary files, and DOCX cache are cleaned.</p></div><button type="button" onClick={handleCleanCaches} disabled={storageLoading || storageCleaning || storageUsage?.active === true} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{storageCleaning ? 'Cleaning...' : 'Clean caches'}</button></div>
        {storageError && <p className="text-xs text-red-700">{storageError}</p>}
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600"><div>logs: {storageLoading ? 'Reading...' : formatBytes(storageUsage?.logs.bytes || 0)}</div><div>temporary: {storageLoading ? 'Reading...' : formatBytes(storageUsage?.temporary.bytes || 0)}</div><div>DOCX cache: {storageLoading ? 'Reading...' : formatBytes(storageUsage?.docxCache.bytes || 0)}</div><div>browser profiles: {storageLoading ? 'Reading...' : formatBytes(storageUsage?.profiles.bytes || 0)}</div></div>
      </section>
      <AiProviderSettings />
    </div>
  );
}
