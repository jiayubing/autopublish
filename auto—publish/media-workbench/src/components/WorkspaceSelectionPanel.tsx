import React from "react";
import { FolderOpen, LoaderCircle, ShieldAlert } from "lucide-react";
import { useWorkspaceFeature } from "../features/workspace/workspace-feature-context";
import {
  getSelectionView,
  getWorkspaceErrorMessage,
} from "../workspace-ui-logic.js";
import { useConfirmation } from "../confirmation";

interface WorkspaceSelectionPanelProps {
  mode: "bootstrap" | "switch";
  title: string;
  description: string;
  showAppName?: boolean;
}

export default function WorkspaceSelectionPanel({
  mode,
  title,
  description,
  showAppName = false,
}: WorkspaceSelectionPanelProps) {
  const { feature, snapshot } = useWorkspaceFeature();
  const { confirm } = useConfirmation();
  const flowState = snapshot.selection.data ||
    snapshot.bootstrap.data || { state: "selection_required", selection: null };
  const chooseBusy =
    mode === "switch"
      ? snapshot.commands.requestSwitch.busy
      : snapshot.commands.chooseDirectory.busy;
  const busy =
    chooseBusy ||
    snapshot.commands.confirmSelection.busy ||
    snapshot.commands.cancelSelection.busy;
  const operationError =
    snapshot.commands.chooseDirectory.error ||
    snapshot.commands.requestSwitch.error ||
    snapshot.commands.confirmSelection.error ||
    snapshot.commands.cancelSelection.error ||
    snapshot.selection.query.error;
  const view = getSelectionView(flowState);
  const selection = flowState.selection;
  const relaunching = view.kind === "relaunching";
  const isConfirmation = view.kind === "confirmation_required";

  const handleChoose = async () => {
    if (busy || relaunching) return;
    if (mode === "switch") {
      const accepted = await confirm({
        title: "切换工作区",
        message: "切换工作区会重启应用，是否继续？",
        confirmLabel: "切换工作区",
        tone: "warning",
      });
      if (!accepted) return;
      await feature.requestSwitch();
      return;
    }
    await feature.chooseDirectory();
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {showAppName && (
          <div>
            <p className="text-xl font-bold text-blue-600">鱼饼大王</p>
            <p className="text-xs text-slate-500">Auto Publish</p>
          </div>
        )}
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        {(operationError || flowState.errorCode) && (
          <div className="mt-5 flex gap-3 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-800">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>
              {operationError?.userMessage ||
                getWorkspaceErrorMessage(flowState.errorCode)}
            </span>
          </div>
        )}
        {isConfirmation && selection && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-medium text-slate-900">已选择工作区</div>
            <div className="mt-2 text-xs text-slate-600">{selection.label}</div>
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
            <button
              type="button"
              onClick={() => void handleChoose()}
              disabled={busy || view.chooseDisabled}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {chooseBusy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              选择工作区
            </button>
          )}
          {isConfirmation && (
            <>
              <button
                type="button"
                onClick={() => void feature.confirmSelection()}
                disabled={busy || view.confirmDisabled}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {snapshot.commands.confirmSelection.busy
                  ? "正在初始化…"
                  : "确认使用此工作区"}
              </button>
              <button
                type="button"
                onClick={() => void feature.cancelSelection()}
                disabled={busy || view.cancelDisabled}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
              >
                取消
              </button>
            </>
          )}
          {relaunching && (
            <span className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
              正在重启应用…
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
