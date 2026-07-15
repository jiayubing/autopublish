import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Info, RefreshCw } from 'lucide-react';
import {
  cancelWorkspaceSelection,
  confirmWorkspaceSelection,
  getCurrentWorkspace,
  openCurrentWorkspace,
  requestWorkspaceSwitch,
} from '../electron-api';
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
  const currentWorkspaceRequestRef = useRef<Promise<WorkspaceCurrent> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      <AiProviderSettings />
    </div>
  );
}
