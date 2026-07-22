import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, LoaderCircle, ShieldAlert } from 'lucide-react';
import { WorkspaceBootstrapState, WorkspaceConfirmationResult } from '../types';
import {
  createWorkspaceSelectionController,
  getSelectionView,
  getWorkspaceErrorCode,
  getWorkspaceErrorMessage,
} from '../workspace-ui-logic.js';

interface WorkspaceSelectionPanelProps {
  state: WorkspaceBootstrapState;
  onChooseDirectory: () => Promise<WorkspaceBootstrapState>;
  onConfirmSelection: (input: { token: string }) => Promise<WorkspaceConfirmationResult>;
  onCancelSelection: () => Promise<WorkspaceBootstrapState>;
  onStateChange: (state: WorkspaceBootstrapState) => void;
  onBusyChange?: (busy: boolean) => void;
  title: string;
  description: string;
  showAppName?: boolean;
}

export default function WorkspaceSelectionPanel({
  state,
  onChooseDirectory,
  onConfirmSelection,
  onCancelSelection,
  onStateChange,
  onBusyChange,
  title,
  description,
  showAppName = false,
}: WorkspaceSelectionPanelProps) {
  const controllerRef = useRef<ReturnType<typeof createWorkspaceSelectionController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createWorkspaceSelectionController({
      initialState: state,
      chooseDirectory: onChooseDirectory,
      confirmSelection: onConfirmSelection,
      cancelSelection: onCancelSelection,
    });
  }
  const controller = controllerRef.current;
  const [flowState, setFlowState] = useState(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => state.error ? getWorkspaceErrorMessage(state.error) : null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      onBusyChange?.(false);
    };
  }, [onBusyChange]);

  useEffect(() => {
    controller.reset(state);
    setFlowState(state);
    setError(state.error ? getWorkspaceErrorMessage(state.error) : null);
  }, [controller, state]);

  const updateState = (nextState: WorkspaceBootstrapState) => {
    if (!activeRef.current) return;
    setFlowState(nextState);
    onStateChange(nextState);
  };

  const updateBusy = (nextBusy: boolean) => {
    if (!activeRef.current) return;
    setBusy(nextBusy);
    onBusyChange?.(nextBusy);
  };

  const handleChoose = async () => {
    if (busy || flowState.state === 'relaunching') return;
    updateBusy(true);
    setError(null);
    try {
      updateState(await controller.chooseDirectory());
    } catch (operationError) {
      if (!activeRef.current) return;
      if (getWorkspaceErrorCode(operationError) === 'WORKSPACE_SELECTION_CANCELLED') {
        updateState(state);
        setError(null);
      } else {
        setError(getWorkspaceErrorMessage(operationError));
      }
    } finally {
      if (activeRef.current) updateBusy(false);
    }
  };

  const handleConfirm = async () => {
    const selection = flowState.selection;
    if (busy || flowState.state !== 'confirmation_required' || !selection) return;
    updateBusy(true);
    setError(null);
    try {
      updateState(await controller.confirmSelection());
    } catch (operationError) {
      if (!activeRef.current) return;
      setError(getWorkspaceErrorMessage(operationError));
    } finally {
      if (activeRef.current) updateBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    updateBusy(true);
    setError(null);
    try {
      updateState(await controller.cancelSelection());
    } catch (operationError) {
      if (!activeRef.current) return;
      if (getWorkspaceErrorCode(operationError) === 'WORKSPACE_SELECTION_CANCELLED') {
        updateState(state);
        setError(null);
      } else {
        setError(getWorkspaceErrorMessage(operationError));
      }
    } finally {
      if (activeRef.current) updateBusy(false);
    }
  };

  const selection = flowState.selection;
  const view = getSelectionView(flowState);
  const relaunching = view.kind === 'relaunching';
  const isConfirmation = view.kind === 'confirmation_required';

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {showAppName && <div><p className="text-xl font-bold text-blue-600">鱼饼大王</p><p className="text-xs text-slate-500">Auto Publish</p></div>}
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

        {(error || flowState.error) && (
          <div className="mt-5 flex gap-3 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-800">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{error || view.errorMessage}</span>
          </div>
        )}

        {isConfirmation && selection && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-medium text-slate-900">已选择工作区</div>
            <div className="mt-2 break-all font-mono text-xs text-slate-600">{selection.path}</div>
            <div className="mt-3">目录类型：{view.category}</div>
            {view.warning && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                {view.warning}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {!isConfirmation && !relaunching && (
            <button type="button" onClick={handleChoose} disabled={busy || view.chooseDisabled} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
              选择工作区
            </button>
          )}
          {isConfirmation && (
            <>
              <button type="button" onClick={handleConfirm} disabled={busy || view.confirmDisabled} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? '正在初始化…' : '确认使用此工作区'}
              </button>
              <button type="button" onClick={handleCancel} disabled={busy || view.cancelDisabled} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
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
