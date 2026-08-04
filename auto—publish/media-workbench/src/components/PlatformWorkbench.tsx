import React, { useCallback, useEffect, useState } from "react";
import type { PlatformArticle } from "../types/platform";
import { AlertCircle, Globe, RefreshCw, X } from "lucide-react";
import { usePlatformFeature } from "../features/platform/platform-feature-context";
import { useConfirmation } from "../confirmation";
import PlatformTaskIndicator from "./PlatformTaskIndicator";
import PlatformQueuePanel from "./PlatformQueuePanel";
import PlatformSubmitPanel from "./PlatformSubmitPanel";
import PlatformSubmissionOverlays from "./PlatformSubmissionOverlays";
import {
  articleSelectionKey,
  type PlatformSubmissionResult,
} from "./platform-workbench-model";

export default function PlatformWorkbench({
  onOpenArticleManagement,
}: { onOpenArticleManagement?: () => void } = {}) {
  const { confirm } = useConfirmation();
  const { snapshot: platformSnapshot, feature: submissionController } =
    usePlatformFeature();
  const queueSnapshot = platformSnapshot.queue;
  const platformState = platformSnapshot.run;
  const queue = queueSnapshot.queue;
  const platforms = queueSnapshot.platforms;
  const loading = queueSnapshot.loading;
  const [isConfirming, setIsConfirming] = useState(false);
  const [autoTrashRequested, setAutoTrashRequested] = useState(() => {
    try {
      return (
        window.localStorage.getItem("auto-publish:auto-trash-after-publish") ===
        "true"
      );
    } catch (_) {
      return false;
    }
  });
  const [submitStatus, setSubmitStatus] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const loginStates = platformSnapshot.loginByPlatformId;
  const {
    selectedArticles,
    selectedPlatformIds,
    result: submitResult,
    showResult,
    error,
    residue,
    commands,
  } = platformSnapshot;
  const isSubmitting = commands.submit.busy;
  const isPausing = commands.pause.busy;
  const isStopping = commands.stop.busy;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "auto-publish:auto-trash-after-publish",
        String(autoTrashRequested),
      );
    } catch (_) {}
  }, [autoTrashRequested]);

  const hasArchiveFailure = useCallback(
    (article: PlatformArticle) => Boolean(article.archiveErrorCode),
    [],
  );
  const isSelectableArticle = useCallback(
    (article: PlatformArticle) =>
      article.sourceArticleState !== "trashed" && !hasArchiveFailure(article),
    [hasArchiveFailure],
  );
  const displayError = error || queueSnapshot.error;
  const taskBusy =
    platformState.isPlatformRunning ||
    ["running", "waiting-interval", "stopping"].includes(platformState.phase);

  const loadQueue = useCallback(async () => {
    try {
      submissionController.setError(null);
      await submissionController.refreshQueue("manual");
    } catch (value: unknown) {
      submissionController.setError(
        value instanceof Error ? value.message : "Failed to load queue",
      );
    }
  }, [submissionController]);

  useEffect(() => {
    submissionController.pruneArticles(
      new Set(queue.filter(isSelectableArticle).map(articleSelectionKey)),
    );
  }, [isSelectableArticle, queue, submissionController]);

  const inspectQueueResidue = useCallback(async () => {
    try {
      await submissionController.inspectResidue();
    } catch (_) {}
  }, [submissionController]);

  useEffect(() => {
    void inspectQueueResidue();
  }, [inspectQueueResidue, queue.length]);

  const repairQueueResidue = async () => {
    if (residue.phase === "checking" || residue.phase === "cleaning") return;
    try {
      const report = await submissionController.inspectResidue();
      if (!report.cleanableCount) return;
      if (
        !(await confirm({
          title: "清理已删除文章队列残留",
          message: `发现 ${report.cleanableCount} 项可安全清理的已删除源文章队列残留。明确失败/queued 项会按身份和哈希校验处理，其他 ${report.reportedCount} 项只报告不更改。`,
          confirmLabel: "确认清理",
          tone: "danger",
        }))
      )
        return;
      await submissionController.cleanupResidue({ confirmed: true });
    } catch (_) {}
  };

  const toggleArticle = (key: string) => {
    const article = queue.find((item) => articleSelectionKey(item) === key);
    if (!article || !isSelectableArticle(article)) return;
    submissionController.toggleArticle(key);
  };

  const toggleGroupCollapse = (platformId: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      return next;
    });
  };

  const selectedArticleList = queue.filter(
    (article) =>
      isSelectableArticle(article) &&
      selectedArticles.has(articleSelectionKey(article)),
  );
  const selectedPlatformList = platforms.filter((platform) =>
    selectedPlatformIds.has(platform.id),
  );
  const taskCount = selectedArticleList.length * selectedPlatformIds.size;
  const selectedHepan = selectedPlatformIds.has("hepan");
  const hepanArticleCount = selectedHepan ? selectedArticleList.length : 0;
  const canSubmit =
    selectedArticleList.length > 0 && selectedPlatformIds.size > 0;

  const handlePause = async () => {
    setSubmitStatus("已暂停 — 正在关闭浏览器...");
    try {
      await submissionController.pause(platformState.runId);
    } catch (_) {}
    setSubmitStatus("");
  };

  const handleStop = async () => {
    try {
      await submissionController.stop(platformState.runId);
    } catch (_) {}
  };

  const handleOpenLogin = async (platformId: string) => {
    try {
      await submissionController.openLogin(platformId);
    } catch (_) {}
  };

  const handleCheckLogin = async (platformId: string) => {
    try {
      await submissionController.checkLogin(platformId);
    } catch (_) {}
  };

  const handleSubmit = async () => {
    if (!canSubmit || taskBusy || isSubmitting) return;
    setIsConfirming(false);
    setSubmitStatus(`正在提交 ${taskCount} 个任务，请稍候...`);
    try {
      await submissionController.submit({
        submissions: selectedArticleList.map((article) => ({
          sourcePlatformId: article.sourcePlatformId,
          filename: article.filename,
          targetPlatformIds: [...selectedPlatformIds],
          accountProfiles: Object.fromEntries(
            [...selectedPlatformIds].map((platformId) => [
              platformId,
              article.accountProfileId || "",
            ]),
          ),
        })),
        autoTrash: autoTrashRequested,
      });
    } catch (_) {
      setSubmitStatus("");
    }
  };

  const terminalResult = (submitResult ||
    platformState.terminalResult) as PlatformSubmissionResult | null;
  const dismissResult = () => {
    submissionController.dismissResult();
    setSubmitStatus("");
  };

  return (
    <div className="flex flex-col h-full">
      <PlatformTaskIndicator snapshot={platformState} />
      <span className="sr-only">
        已处理 {platformState.processed} / {platformState.total}
      </span>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
            <Globe className="w-4.5 h-4.5" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">其他平台投稿</h2>
        </div>
        <button
          onClick={loadQueue}
          disabled={loading || taskBusy}
          className="flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg shadow-2xs transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
          <span>刷新队列</span>
        </button>
        {residue.cleanableCount > 0 && (
          <button
            type="button"
            onClick={() => void repairQueueResidue()}
            disabled={
              loading ||
              taskBusy ||
              residue.phase === "checking" ||
              residue.phase === "cleaning"
            }
            className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
          >
            {residue.phase === "checking"
              ? "检查中…"
              : residue.phase === "cleaning"
                ? "清理中…"
                : `检查并清理已删除文章残留 · 安全收尾 (${residue.cleanableCount})`}
          </button>
        )}
        {residue.reportedCount > 0 && (
          <button
            type="button"
            onClick={onOpenArticleManagement}
            disabled={loading || taskBusy}
            className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50"
          >
            查看需处理项 ({residue.reportedCount})
          </button>
        )}
      </div>

      {residue.feedback && (
        <div
          role={residue.feedback.kind === "error" ? "alert" : "status"}
          aria-live={residue.feedback.kind === "error" ? "assertive" : "polite"}
          className={`mb-3 rounded border p-3 text-xs ${residue.feedback.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
        >
          {residue.feedback.text}
        </div>
      )}

      {displayError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{displayError}</span>
          <button
            onClick={() => submissionController.setError(null)}
            className="ml-auto shrink-0 p-0.5 hover:bg-red-100 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
        <PlatformQueuePanel
          queue={queue}
          platforms={platforms}
          loading={loading}
          selectedArticles={selectedArticles}
          collapsedGroups={collapsedGroups}
          isSelectableArticle={isSelectableArticle}
          onReplaceArticles={(keys) =>
            submissionController.replaceArticles(keys)
          }
          onToggleArticle={toggleArticle}
          onToggleGroupCollapse={toggleGroupCollapse}
        />
        <PlatformSubmitPanel
          platforms={platforms}
          selectedPlatformIds={selectedPlatformIds}
          loginStates={loginStates}
          selectedArticleCount={selectedArticleList.length}
          queueLength={queue.length}
          taskCount={taskCount}
          platformState={platformState}
          submitStatus={submitStatus}
          taskBusy={taskBusy}
          isSubmitting={isSubmitting}
          isPausing={isPausing}
          isStopping={isStopping}
          canSubmit={canSubmit}
          onTogglePlatform={(platformId) =>
            submissionController.togglePlatform(platformId)
          }
          onOpenLogin={handleOpenLogin}
          onCheckLogin={handleCheckLogin}
          onPause={handlePause}
          onStop={handleStop}
          onOpenConfirmation={() => setIsConfirming(true)}
        />
      </div>

      <PlatformSubmissionOverlays
        isConfirming={isConfirming}
        showResult={showResult}
        selectedArticleList={selectedArticleList}
        selectedPlatformList={selectedPlatformList}
        selectedPlatformIds={selectedPlatformIds}
        taskCount={taskCount}
        selectedHepan={selectedHepan}
        hepanArticleCount={hepanArticleCount}
        autoTrashRequested={autoTrashRequested}
        taskBusy={taskBusy}
        isSubmitting={isSubmitting}
        canSubmit={canSubmit}
        submitResult={submitResult as PlatformSubmissionResult | null}
        terminalResult={terminalResult}
        onSetConfirming={setIsConfirming}
        onSetAutoTrashRequested={setAutoTrashRequested}
        onSubmit={handleSubmit}
        onDismissResult={dismissResult}
        onOpenArticleManagement={onOpenArticleManagement}
      />
    </div>
  );
}
