import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Info, RefreshCw } from 'lucide-react';
import {
  cancelWorkspaceSelection,
  confirmWorkspaceSelection,
  getCurrentWorkspace,
  openCurrentWorkspace,
  requestWorkspaceSwitch,
  getRuntimeDiagnostics,
  runBrowserSelfCheck,
} from '../electron-api';
import type { RuntimeDiagnostics } from '../electron-api';
import {
  WorkspaceBootstrapState,
  WorkspaceConfirmationResult,
  WorkspaceCurrent,
} from '../types';
import { getSettingsCommandState } from '../workspace-ui-logic.js';
import AiProviderSettings from './AiProviderSettings';
import WorkspaceSelectionPanel from './WorkspaceSelectionPanel';

const READY_STATE: WorkspaceBootstrapState = {
  state: 'ready',
  workspacePath: null,
  envOverride: false,
};

type StorageUsageCategory = { bytes: number; files: number; followedSymlinks?: number };
type StorageUsage = {
  logs: StorageUsageCategory;
  temporary: StorageUsageCategory;
  docxCache: StorageUsageCategory;
  profiles: StorageUsageCategory;
  active?: boolean;
};
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
  if (kind === 'existing_workspace') return '已有工作区，标记有效';
  if (kind === 'empty_directory') return '空目录，可初始化';
  if (kind === 'nonempty_directory') return '非空目录，需确认初始化';
  return '未读取到验证状态';
}

function safeErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  if (code === 'WORKSPACE_ENV_OVERRIDE') return '当前工作区由环境变量控制，不能在此更换。';
  if (code === 'WORKSPACE_OPEN_FAILED') return '无法打开当前工作区。';
  if (code === 'WORKSPACE_SWITCH_BUSY') return '当前有任务正在运行，暂时不能切换工作区。';
  return '工作区操作失败，请重试。';
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshStorageUsage = async () => {
    const api = getStorageMaintenanceApi();
    if (!api) {
      setStorageLoading(false);
      return;
    }
    setStorageLoading(true);
    try {
      const result = await api.getUsage();
      if (!result.ok || !result.data) throw new Error(result.error?.message || 'Unable to read storage usage');
      setStorageUsage(result.data);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Unable to read storage usage');
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    void refreshStorageUsage();
  }, []);

  useEffect(() => {
    let active = true;
    getRuntimeDiagnostics()
      .then((value) => { if (active) setRuntimeDiagnostics(value); })
      .catch((error) => { if (active) setRuntimeError(error instanceof Error ? error.message : '无法读取运行时状态'); })
      .finally(() => { if (active) setRuntimeLoading(false); });
    return () => { active = false; };
  }, []);

  const handleRuntimeSelfCheck = async () => {
    if (runtimeChecking) return;
    setRuntimeChecking(true);
    setRuntimeError(null);
    try {
      await runBrowserSelfCheck();
      setRuntimeDiagnostics(await getRuntimeDiagnostics());
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : '浏览器自检失败');
    } finally {
      setRuntimeChecking(false);
    }
  };

  const runtimeItems = runtimeDiagnostics ? [
    ['Playwright Node', runtimeDiagnostics.tools.playwrightNode],
    ['Playwright CLI', runtimeDiagnostics.tools.playwrightCli],
    ['Edge/Chrome', runtimeDiagnostics.browserChannel ? { available: runtimeDiagnostics.browserChannel.available && runtimeDiagnostics.browserChannel.probed, source: runtimeDiagnostics.browserChannel.source } : { available: false, source: null }],
    ['MarkItDown', runtimeDiagnostics.tools.markitdown],
    ['Hepan Python', runtimeDiagnostics.tools.hepanPython],
  ] : [];

  const handleCleanCaches = async () => {
    const api = getStorageMaintenanceApi();
    if (!api || storageCleaning || storageUsage?.active) return;
    setStorageCleaning(true);
    try {
      const result = await api.cleanCaches();
      if (!result.ok) throw new Error(result.error?.message || 'Cache cleanup failed');
      if (result.data?.blocked) throw new Error('Cache cleanup is unavailable while a task is active');
      await refreshStorageUsage();
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Cache cleanup failed');
    } finally {
      setStorageCleaning(false);
    }
  };

  useEffect(() => {
    let active = true;
    const request = currentWorkspaceRequestRef.current || (currentWorkspaceRequestRef.current = getCurrentWorkspace());
    request
      .then((workspace) => {
        if (!active) return;
        setCurrent(workspace);
        setSwitchState({
          state: 'ready',
          workspacePath: workspace.workspacePath,
          envOverride: workspace.envOverride,
        });
      })
      .catch((error: unknown) => {
        if (active) setOperationError(safeErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const envOverride = current?.envOverride === true;
  const commandState = getSettingsCommandState({ loading, switchBusy, current, switchState });

  const handleOpen = async () => {
    setOperationError(null);
    try {
      await openCurrentWorkspace();
      if (!mountedRef.current) return;
      setOperationError(null);
    } catch (error) {
      if (mountedRef.current) setOperationError(safeErrorMessage(error));
    }
  };

  const handleRequestSwitch = async (): Promise<WorkspaceBootstrapState> => {
    const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
      || window.confirm('切换工作区会重启应用，未保存内容可能丢失。是否继续？');
    if (!confirmed) {
      return {
        state: 'ready',
        workspacePath: current?.workspacePath || null,
        envOverride,
      };
    }
    setOperationError(null);
    return requestWorkspaceSwitch();
  };

  const handleSwitchStateChange = (nextState: WorkspaceBootstrapState) => {
    setSwitchState(nextState);
    if (nextState.state === 'relaunching') setSwitchOpen(true);
  };

  const currentPath = current?.workspacePath || '尚未读取到工作区路径';

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">工作区设置</h2>
        <p className="mt-1 text-xs text-slate-500">工作区路径和验证结果由主进程服务提供。</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FolderOpen className="h-4 w-4" /> 当前工作区
        </h3>
        <div className="break-all rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700" aria-label="当前工作区路径">
          {loading ? '正在读取…' : currentPath}
        </div>
        <div className="text-xs text-slate-600">
          验证状态：{loading ? '正在检查…' : validationLabel(current?.validation?.kind)}
        </div>
        {envOverride && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            当前工作区由环境变量控制，不能在此更换。请移除 AUTO_PUBLISH_WORKSPACE 后重启应用。
          </div>
        )}
        {operationError && <p className="text-sm text-red-700">{operationError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleOpen} disabled={commandState.openDisabled} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            <ExternalLink className="h-4 w-4" /> 打开文件夹
          </button>
          <button type="button" onClick={() => setSwitchOpen(true)} disabled={commandState.switchDisabled} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> 更换工作区
          </button>
        </div>
      </section>

      {switchOpen && !envOverride && (
        <WorkspaceSelectionPanel
          state={switchState}
          onChooseDirectory={handleRequestSwitch}
          onConfirmSelection={async (input): Promise<WorkspaceConfirmationResult> => confirmWorkspaceSelection(input)}
          onCancelSelection={cancelWorkspaceSelection}
          onStateChange={handleSwitchStateChange}
          onBusyChange={setSwitchBusy}
          title="更换工作区"
          description="选择新目录后，主进程会再次检查运行状态并在确认后重启应用。"
        />
      )}

      <section className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800">
        <Info className="h-4 w-4 shrink-0" />
        <span>工作区切换不会复制、移动或删除原工作区数据；最终安全检查由主进程服务完成。投稿不会因文件新增或预检通过而自动投稿。</span>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">运行环境自检</h3>
            <p className="mt-1 text-xs text-slate-500">Playwright 使用应用内置 Node/CLI；浏览器自检只访问临时 about:blank 并在完成后关闭。</p>
          </div>
          <button type="button" onClick={() => void handleRuntimeSelfCheck()} disabled={runtimeLoading || runtimeChecking} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            {runtimeChecking ? '自检中…' : '运行浏览器自检'}
          </button>
        </div>
        {runtimeError && <p className="text-xs text-red-700">{runtimeError}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {runtimeItems.map(([label, item]) => (
            <div key={label} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-700">{label}</span>
              <span className={item.available ? 'text-emerald-700' : 'text-rose-700'}>{item.available ? '可用' : '不可用'}</span>
            </div>
          ))}
        </div>
        {runtimeDiagnostics?.browserChannel && !runtimeDiagnostics.browserChannel.probed && <p className="text-xs text-amber-700">浏览器通道已配置为 {runtimeDiagnostics.browserChannel.channel || '未配置'}，请运行自检确认 Edge/Chrome 可启动。</p>}
        {runtimeDiagnostics?.errors.some((error) => error.code === 'PLAYWRIGHT_NODE_UNAVAILABLE' || error.code === 'PLAYWRIGHT_CLI_UNAVAILABLE' || error.code === 'BROWSER_CHANNEL_UNAVAILABLE') && <p className="text-xs text-amber-700">浏览器功能不可用时，请重新安装应用；若 Edge 缺失，请安装 Edge 或在应用级设置中选择可用的 Chrome channel。</p>}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">运行数据占用</h3>
            <p className="mt-1 text-xs text-slate-500">只清理过期日志、临时文件和 DOCX 缓存；豆包登录态和内容数据不会被自动删除。</p>
          </div>
          <button type="button" onClick={handleCleanCaches} disabled={storageLoading || storageCleaning || storageUsage?.active === true} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            {storageCleaning ? '清理中…' : '清理缓存'}
          </button>
        </div>
        {storageError && <p className="text-xs text-red-700">{storageError}</p>}
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
          <div>日志：{storageLoading ? '读取中…' : formatBytes(storageUsage?.logs.bytes || 0)}</div>
          <div>临时文件：{storageLoading ? '读取中…' : formatBytes(storageUsage?.temporary.bytes || 0)}</div>
          <div>DOCX 缓存：{storageLoading ? '读取中…' : formatBytes(storageUsage?.docxCache.bytes || 0)}</div>
          <div>浏览器 profile：{storageLoading ? '读取中…' : formatBytes(storageUsage?.profiles.bytes || 0)}</div>
        </div>
      </section>
      <AiProviderSettings />
    </div>
  );
}
