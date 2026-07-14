import React, { useEffect, useState } from 'react';
import { FolderOpen, LoaderCircle, ShieldAlert } from 'lucide-react';
import { IpcError, WorkspaceBootstrapState, WorkspaceConfirmationResult } from '../types';

interface WorkspaceSelectionPanelProps {
  state: WorkspaceBootstrapState;
  onChooseDirectory: () => Promise<WorkspaceBootstrapState>;
  onConfirmSelection: (input: { token: string }) => Promise<WorkspaceConfirmationResult>;
  onCancelSelection: () => Promise<WorkspaceBootstrapState>;
  onStateChange: (state: WorkspaceBootstrapState) => void;
  title: string;
  description: string;
  showAppName?: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  WORKSPACE_SELECTION_CANCELLED: '已取消选择，当前工作区没有改变。',
  WORKSPACE_SELECTION_REQUIRED: '尚未选择工作区，请选择一个可用目录。',
  WORKSPACE_CONFIRMATION_REQUIRED: '请确认后再初始化工作区。',
  WORKSPACE_PATH_INVALID: '所选目录无效，请重新选择。',
  WORKSPACE_PATH_FORBIDDEN: '出于安全原因，不能使用该目录。',
  WORKSPACE_NOT_WRITABLE: '所选目录不可写，请选择其他目录。',
  WORKSPACE_MARKER_INVALID: '工作区标记无效，请重新选择目录。',
  WORKSPACE_SELECTION_EXPIRED: '选择已过期，请重新选择目录。',
  WORKSPACE_SWITCH_BUSY: '当前有任务正在运行，暂时不能切换工作区。',
  WORKSPACE_ENV_OVERRIDE: '工作区由环境变量控制，暂时不能更换。',
  WORKSPACE_RELAUNCH_FAILED: '应用重启失败，请稍后重试。',
  WORKSPACE_OPEN_FAILED: '无法打开当前工作区。',
  WORKSPACE_BOOTSTRAP_FAILED: '工作区状态检查失败，请重试。',
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function safeErrorMessage(error: unknown): string {
  const code = errorCode(error);
  return (code && ERROR_MESSAGES[code]) || '工作区操作失败，请重试。';
}

function errorFromState(error?: IpcError): string | null {
  return error ? safeErrorMessage(error) : null;
}

function kindLabel(kind: string): string {
  if (kind === 'existing_workspace') return '已有工作区';
  if (kind === 'empty_directory') return '空目录';
  if (kind === 'nonempty_directory') return '非空目录';
  return '待验证目录';
}

export default function WorkspaceSelectionPanel({
  state,
  onChooseDirectory,
  onConfirmSelection,
  onCancelSelection,
  onStateChange,
  title,
  description,
  showAppName = false,
}: WorkspaceSelectionPanelProps) {
  const [flowState, setFlowState] = useState(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => errorFromState(state.error));

  useEffect(() => {
    setFlowState(state);
    setError(errorFromState(state.error));
  }, [state]);

  const updateState = (nextState: WorkspaceBootstrapState) => {
    setFlowState(nextState);
    onStateChange(nextState);
  };

  const handleChoose = async () => {
    if (busy || flowState.state === 'relaunching') return;
    setBusy(true);
    setError(null);
    try {
      updateState(await onChooseDirectory());
    } catch (operationError) {
      if (errorCode(operationError) === 'WORKSPACE_SELECTION_CANCELLED') {
        updateState(state);
        setError(null);
      } else {
        setError(safeErrorMessage(operationError));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    const selection = flowState.selection;
    if (busy || flowState.state !== 'confirmation_required' || !selection) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirmSelection({ token: selection.token });
      updateState({
        state: result.state,
        workspacePath: result.workspacePath,
        envOverride: result.envOverride,
      });
    } catch (operationError) {
      setError(safeErrorMessage(operationError));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCancelSelection();
      updateState(state);
    } catch (operationError) {
      if (errorCode(operationError) === 'WORKSPACE_SELECTION_CANCELLED') {
        updateState(state);
        setError(null);
      } else {
        setError(safeErrorMessage(operationError));
      }
    } finally {
      setBusy(false);
    }
  };

  const selection = flowState.selection;
  const relaunching = flowState.state === 'relaunching';
  const isConfirmation = flowState.state === 'confirmation_required' && Boolean(selection);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {showAppName && <p className="text-sm font-semibold tracking-wide text-blue-600">AutoPublish</p>}
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

        {(error || flowState.error) && (
          <div className="mt-5 flex gap-3 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-800">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{error || errorFromState(flowState.error)}</span>
          </div>
        )}

        {isConfirmation && selection && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-medium text-slate-900">已选择工作区</div>
            <div className="mt-2 break-all font-mono text-xs text-slate-600">{selection.path}</div>
            <div className="mt-3">目录类型：{kindLabel(selection.kind)}</div>
            {selection.kind === 'nonempty_directory' && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                这是非空目录。确认后将在其中创建 AutoPublish 工作区目录和必要文件，不会删除或覆盖现有文件。
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {!isConfirmation && !relaunching && (
            <button type="button" onClick={handleChoose} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
              选择工作区
            </button>
          )}
          {isConfirmation && (
            <>
              <button type="button" onClick={handleConfirm} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? '正在初始化…' : '确认使用此工作区'}
              </button>
              <button type="button" onClick={handleCancel} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                取消
              </button>
            </>
          )}
          {relaunching && (
            <span className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">正在重启应用…</span>
          )}
        </div>
      </section>
    </main>
  );
}
