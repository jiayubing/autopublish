import React, {
  useState,
  useEffect,
  useCallback,
} from "react";
import type { PlatformArticle, PlatformTarget } from "../types";
import PlatformTaskIndicator from "./PlatformTaskIndicator";
import {
  RefreshCw,
  Send,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  AlertCircle,
  CheckCircle,
  Pause,
  Play,
  XCircle,
  Clock,
  X,
  Loader2,
  LogIn,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePlatformFeature } from "../features/platform/platform-feature-context";
import { useConfirmation } from "../confirmation";

// hepan is the technical ID for 蓝色河畔. We keep this mapping and do NOT
// Platform display names and submission adaptation belong to the platform bridge.

const PLATFORM_ORDER = ["lieju", "toutiao", "hepan"] as const;

function archiveErrorText(
  value: string | null | undefined,
): string {
  return value || "ARCHIVE_FAILED";
}

function articleSelectionKey(article: PlatformArticle): string {
  return `${article.sourcePlatformId}\u0000${article.filename}`;
}

export default function PlatformWorkbench({
  onOpenArticleManagement,
}: { onOpenArticleManagement?: () => void } = {}) {
  const { confirm } = useConfirmation();
  const { snapshot: platformSnapshot, feature: submissionController } = usePlatformFeature();
  const queueSnapshot = platformSnapshot.queue;
  const platformState = platformSnapshot.run;
  const queue = queueSnapshot.queue;
  const platforms: PlatformTarget[] = queueSnapshot.platforms;
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
  const [submitStatus, setSubmitStatus] = useState<string>("");
  const loginStates = platformSnapshot.loginByPlatformId;
  const commandState = platformSnapshot;
  const {
    selectedArticles,
    selectedPlatformIds,
    result: submitResult,
    showResult,
    error,
    residue,
    commands,
  } = commandState;
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

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
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
  const taskIsActive =
    platformState.isPlatformRunning ||
    ["running", "waiting-interval", "stopping"].includes(platformState.phase);
  const taskBusy = taskIsActive;

  const loadQueue = useCallback(async () => {
    try {
      submissionController.setError(null);
      await submissionController.refreshQueue("manual");
    } catch (e: unknown) {
      submissionController.setError(
        e instanceof Error ? e.message : "Failed to load queue",
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
      if (!report.cleanableCount) {
        return;
      }
      if (!(await confirm({
        title: '清理已删除文章队列残留',
        message: `发现 ${report.cleanableCount} 项可安全清理的已删除源文章队列残留。明确失败/queued 项会按身份和哈希校验处理，其他 ${report.reportedCount} 项只报告不更改。`,
        confirmLabel: '确认清理',
        tone: 'danger',
      }))) return;
      await submissionController.cleanupResidue({ confirmed: true });
    } catch (_) {}
  };

  const groupedArticles: Record<string, PlatformArticle[]> = {};
  for (const article of queue) {
    const key = article.sourcePlatformId || article.platformId || "unknown";
    if (!groupedArticles[key]) groupedArticles[key] = [];
    groupedArticles[key].push(article);
  }

  const sortedGroups = PLATFORM_ORDER.filter((id) => groupedArticles[id]);

  const toggleArticle = (key: string) => {
    const article = queue.find((item) => articleSelectionKey(item) === key);
    if (!article || !isSelectableArticle(article)) return;
    submissionController.toggleArticle(key);
  };

  const toggleSelectAllInGroup = (platformId: string) => {
    const groupArticles = groupedArticles[platformId] || [];
    const selectableGroup = groupArticles.filter(isSelectableArticle);
    if (!selectableGroup.length) return;
    const allSelected = selectableGroup.every((a) =>
      selectedArticles.has(articleSelectionKey(a)),
    );
    submissionController.selectGroup(
      selectableGroup.map(articleSelectionKey),
      allSelected,
    );
  };

  const togglePlatform = (platformId: string) => {
    submissionController.togglePlatform(platformId);
  };

  const toggleGroupCollapse = (platformId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      return next;
    });
  };

  const selectedArticleList = queue.filter(
    (a) =>
      isSelectableArticle(a) && selectedArticles.has(articleSelectionKey(a)),
  );
  const selectedPlatformList = platforms.filter((p) =>
    selectedPlatformIds.has(p.id),
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
    } catch (e: unknown) {
      setSubmitStatus("");
    }
  };

  const terminalResult = submitResult || platformState.terminalResult;
  const resultOk = terminalResult?.ok ?? 0;
  const resultFail = terminalResult?.fail ?? 0;
  const resultSkipped = terminalResult?.skipped ?? 0;
  const waitingSeconds = Math.max(
    0,
    Math.ceil((platformState.waitRemainingMs || 0) / 1000),
  );
  const nextTaskLabel =
    platformState.nextTask?.filename ||
    platformState.task?.filename ||
    "下一篇";
  const platformPhase = platformState.phase || platformState.status || "";
  const isWaitingInterval =
    platformPhase === "waiting-interval" ||
    platformPhase === "waiting_interval";
  const trashReasonText = submitResult?.trashSummary?.reasonCodes?.length
    ? `原因：${submitResult.trashSummary.reasonCodes.join("、")}`
    : "";

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
      {/* Header */}
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
        {/* Left panel */}
        <div className="lg:col-span-7 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-semibold text-slate-600 flex items-center space-x-1.5">
              <FileText className="w-4 h-4" />
              <span>待发布文章</span>
              <span className="text-xs font-normal text-slate-400 ml-1">
                ({queue.length})
              </span>
            </h3>
            {queue.length > 0 && (
              <button
                onClick={() => {
                  const selectableQueue = queue.filter(isSelectableArticle);
                  const allSelected =
                    selectableQueue.length > 0 &&
                    selectableQueue.every((a) =>
                      selectedArticles.has(articleSelectionKey(a)),
                    );
                  if (allSelected) {
                    submissionController.replaceArticles([]);
                  } else {
                    submissionController.replaceArticles(
                      selectableQueue.map(articleSelectionKey),
                    );
                  }
                }}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium"
              >
                {queue.filter(isSelectableArticle).length > 0 &&
                queue
                  .filter(isSelectableArticle)
                  .every((a) => selectedArticles.has(articleSelectionKey(a)))
                  ? "取消全选"
                  : "全选"}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">加载队列中...</span>
              </div>
            ) : queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                <FileText className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-sm">暂无待发布文章</span>
                <span className="text-xs mt-1">
                  请在 input/lieju、input/toutiao 或 input/hepan 目录中添加文章
                </span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sortedGroups.map((platformId) => {
                  const groupArticles = groupedArticles[platformId];
                  const isCollapsed = collapsedGroups.has(platformId);
                  const selectableGroup =
                    groupArticles.filter(isSelectableArticle);
                  const allInGroupSelected =
                    selectableGroup.length > 0 &&
                    selectableGroup.every((a) =>
                      selectedArticles.has(articleSelectionKey(a)),
                    );
                  const someInGroupSelected = selectableGroup.some((a) =>
                    selectedArticles.has(articleSelectionKey(a)),
                  );

                  const displayName =
                    platforms.find((p) => p.id === platformId)?.displayName ||
                    platformId;

                  return (
                    <div key={platformId}>
                      <button
                        onClick={() => toggleGroupCollapse(platformId)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectAllInGroup(platformId);
                            }}
                            className="p-0.5"
                          >
                            {allInGroupSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-500" />
                            ) : someInGroupSelected ? (
                              <div className="w-4 h-4 rounded border-2 border-blue-400 bg-blue-100 flex items-center justify-center">
                                <div className="w-2 h-0.5 bg-blue-500 rounded" />
                              </div>
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                          <span className="text-sm font-semibold text-slate-700">
                            {displayName}
                          </span>
                          <span className="text-xs text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-full">
                            {groupArticles.length}
                          </span>
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div>
                          {groupArticles.map((article) => (
                            <button
                              key={articleSelectionKey(article)}
                              onClick={() =>
                                toggleArticle(articleSelectionKey(article))
                              }
                              disabled={!isSelectableArticle(article)}
                              title={
                                article.archiveErrorCode
                                  ? "远端已发布，本地归档待处理，禁止再次远端投稿"
                                  : article.sourceArticleState === "trashed"
                                    ? `源文章已删除，禁止投稿${article.reasonCode ? `：${article.reasonCode}` : ""}`
                                    : undefined
                              }
                              className={`w-full flex items-center space-x-2.5 px-3.5 py-2 transition-colors text-left ${
                                selectedArticles.has(
                                  articleSelectionKey(article),
                                )
                                  ? "bg-blue-50/60"
                                  : article.archiveErrorCode
                                    ? "bg-amber-50/60"
                                    : article.sourceArticleState === "trashed"
                                      ? "bg-rose-50/60"
                                      : "hover:bg-slate-50"
                              }`}
                            >
                              {article.archiveErrorCode ? (
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                              ) : article.sourceArticleState === "trashed" ? (
                                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                              ) : selectedArticles.has(
                                  articleSelectionKey(article),
                                ) ? (
                                <CheckSquare className="w-4 h-4 text-blue-500 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-700 truncate">
                                  {article.title || article.filename}
                                </p>
                                <p className="text-xs text-slate-400 truncate">
                                  {article.archiveErrorCode
                                    ? "远端已发布，本地归档待处理（禁止重投）"
                                    : article.sourceArticleState === "trashed"
                                      ? `源文章已删除，禁止投稿${article.reasonCode ? ` · ${article.reasonCode}` : ""}`
                                      : article.filename}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-5 flex flex-col min-h-0">
          <h3 className="text-sm font-semibold text-slate-600 flex items-center space-x-1.5 mb-2.5">
            <Send className="w-4 h-4" />
            <span>目标平台</span>
            <span className="text-xs font-normal text-slate-400 ml-1">
              ({selectedPlatformIds.size} 已选)
            </span>
          </h3>

          <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm p-4 overflow-y-auto">
            {platforms.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
                暂无可用目标平台
              </div>
            ) : (
              <div className="space-y-2">
                {platforms.map((platform) => {
                  const loginState = loginStates[platform.id];
                  return (
                    <div
                      key={platform.id}
                      className={`overflow-hidden rounded-lg border transition-all ${
                        selectedPlatformIds.has(platform.id)
                          ? "border-blue-300 bg-blue-50/60 shadow-sm"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePlatform(platform.id)}
                        className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-50"
                      >
                        <div className="flex items-center space-x-3">
                          {selectedPlatformIds.has(platform.id) ? (
                            <CheckSquare className="w-4.5 h-4.5 text-blue-500" />
                          ) : (
                            <Square className="w-4.5 h-4.5 text-slate-300" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-slate-700">
                              {platform.displayName}
                            </p>
                            <p className="text-xs text-slate-400">投稿目标</p>
                          </div>
                        </div>
                      </button>
                      {platform.loginAvailable && (
                        <div className="border-t border-slate-200 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleOpenLogin(platform.id)}
                              disabled={taskBusy || loginState?.busy}
                              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <LogIn className="h-3.5 w-3.5" />
                              <span>打开登录</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCheckLogin(platform.id)}
                              disabled={taskBusy || loginState?.busy}
                              className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            >
                              {loginState?.busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                              <span>检查登录</span>
                            </button>
                          </div>
                          {loginState?.message && (
                            <p
                              role={
                                loginState.authenticated === false
                                  ? "alert"
                                  : "status"
                              }
                              className={`mt-2 text-xs ${
                                loginState.authenticated === true
                                  ? "text-emerald-700"
                                  : loginState.authenticated === false
                                    ? "text-amber-700"
                                    : "text-slate-500"
                              }`}
                            >
                              {loginState.message}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <p className="text-xs text-slate-500 mb-1">任务预览</p>
              <p className="text-sm font-semibold text-slate-700">
                已选{" "}
                <span className="text-blue-600 font-bold">
                  {selectedArticleList.length}
                </span>{" "}
                篇文章 ×{" "}
                <span className="text-emerald-600 font-bold">
                  {selectedPlatformIds.size}
                </span>{" "}
                个平台 ={" "}
                <span className="text-indigo-600 font-bold text-base">
                  {taskCount}
                </span>{" "}
                个任务
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Status banner */}
      {(submitStatus || taskIsActive) && (
        <div className="mt-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isWaitingInterval ? (
              <Clock className="w-4 h-4 text-blue-500 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
            )}
            <span>
              {isWaitingInterval
                ? `等待下一篇河畔文章：${waitingSeconds} 秒（${nextTaskLabel}）`
                : submitStatus || "正在投稿…"}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handlePause}
              disabled={isPausing}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-bold rounded-md shadow-sm transition-all active:scale-95 flex items-center space-x-1"
            >
              <Pause className="w-3 h-3" />
              <span>{isPausing ? '暂停中...' : '暂停'}</span>
            </button>
            <button
              onClick={handleStop}
              disabled={isStopping}
              className="px-2.5 py-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-xs font-bold rounded-md shadow-sm transition-all active:scale-95 flex items-center space-x-1"
            >
              <XCircle className="w-3 h-3" />
              <span>{isStopping ? "停止中..." : "取消"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {queue.length > 0
            ? `共 ${queue.length} 篇文章待处理，已选 ${selectedArticleList.length} 篇`
            : "队列为空"}
        </div>
        <button
          onClick={() => setIsConfirming(true)}
          disabled={!canSubmit || taskBusy || isSubmitting}
          className="flex items-center space-x-1.5 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white text-sm font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none disabled:shadow-none"
        >
          <Send className="w-4 h-4" />
          <span>{taskBusy || isSubmitting ? "提交中..." : `确认提交 (${taskCount} 任务)`}</span>
        </button>
      </div>

      {/* Confirmation overlay */}
      <AnimatePresence>
        {isConfirming && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <span>确认发布任务</span>
                </h3>
                <button
                  onClick={() => setIsConfirming(false)}
                  disabled={taskBusy}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4.5 h-4.5 text-slate-400" />
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    已选文章 ({selectedArticleList.length})
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {selectedArticleList.map((a) => (
                      <div
                        key={articleSelectionKey(a)}
                        className="flex items-center space-x-2 text-xs text-slate-600 py-1"
                      >
                        <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {a.title || a.filename}
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedArticleList.length === 0 && (
                    <p className="text-xs text-red-500">请先选择至少一篇文章</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    目标平台 ({selectedPlatformIds.size})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPlatformList.map((p) => (
                      <span
                        key={p.id}
                        className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200"
                      >
                        {p.displayName}
                      </span>
                    ))}
                  </div>
                  {selectedPlatformIds.size === 0 && (
                    <p className="text-xs text-red-500">
                      请先选择至少一个目标平台
                    </p>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                  <p className="text-sm font-bold text-indigo-700">
                    共 {taskCount} 个发布任务
                  </p>
                  {selectedHepan && (
                    <p className="mt-1 text-xs text-indigo-700">
                      河畔文章：{hepanArticleCount} 篇 · 投稿间隔由配置中心控制，实际等待以运行进度为准。
                    </p>
                  )}
                </div>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoTrashRequested}
                    onChange={(event) =>
                      setAutoTrashRequested(event.target.checked)
                    }
                    disabled={taskBusy}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>全部目标发布成功后自动移入回收站</strong>
                    <span className="mt-1 block text-slate-500">
                      默认关闭；远端已发布内容不会撤回，发布记录和标题快照会保留。失败、待确认或本地归档失败时不会自动回收。
                    </span>
                  </span>
                </label>

                {!canSubmit && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      请确保已选择文章和目标平台后再提交
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end space-x-2">
                <button
                  onClick={() => setIsConfirming(false)}
                  disabled={taskBusy}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || taskBusy || isSubmitting}
                  className="flex items-center space-x-1.5 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none"
                >
                  {taskBusy || isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>提交中...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>确认提交</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Result overlay */}
      <AnimatePresence>
        {showResult && submitResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span>提交结果</span>
                </h3>
                <button
                  onClick={dismissResult}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4.5 h-4.5 text-slate-400" />
                </button>
              </div>

              <div className="px-6 py-4">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                      {resultOk}
                    </p>
                    <p className="text-xs text-emerald-600 font-medium">成功</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                    <p className="text-2xl font-bold text-red-500">
                      {resultFail}
                    </p>
                    <p className="text-xs text-red-500 font-medium">失败</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                    <p className="text-2xl font-bold text-amber-500">
                      {resultSkipped}
                    </p>
                    <p className="text-xs text-amber-500 font-medium">跳过</p>
                  </div>
                </div>
                {submitResult.archiveSummary &&
                  submitResult.archiveSummary.failed > 0 && (
                    <div
                      role="status"
                      className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
                    >
                      远端已发布，本地归档待处理：
                      {submitResult.archiveSummary.failed}{" "}
                      项。队列中的这些文章已禁止再次远端投稿。
                    </div>
                  )}
                {submitResult.trashDisposition === "offer_trash" && (
                  <div
                    role="status"
                    className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
                  >
                    已发布 {submitResult.trashSummary?.offeredCount || resultOk}{" "}
                    篇，可移入回收站。
                    <button
                      type="button"
                      onClick={onOpenArticleManagement}
                      className="ml-2 rounded border border-emerald-300 px-2 py-1 font-semibold"
                    >
                      打开文章管理
                    </button>
                  </div>
                )}
                {submitResult.trashDisposition === "auto_trash_blocked" && (
                  <div
                    role="alert"
                    className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
                  >
                    自动回收未执行：存在失败、待确认、活动投稿或本地归档待处理项。远端已发布结果保持不变，可稍后从文章管理手动回收。
                    {trashReasonText && (
                      <span className="mt-1 block">{trashReasonText}</span>
                    )}
                  </div>
                )}
                {submitResult.trashDisposition === "auto_trash_requested" && (
                  <div
                    role="status"
                    className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
                  >
                    已发布目标全部满足条件，文章本地副本已按确认策略移入回收站；发布记录继续保留。
                    {(submitResult.trashSummary?.recoveryCount || 0) > 0 && (
                      <span className="mt-1 block">
                        部分回收已进入恢复事务，系统会继续刷新处理状态。
                      </span>
                    )}
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {(terminalResult?.results || []).map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center space-x-2.5 p-2.5 rounded-lg text-xs ${
                        r.status === "success"
                          ? "bg-emerald-50/60"
                          : r.status === "failed"
                            ? "bg-red-50/60"
                            : "bg-slate-50/60"
                      }`}
                    >
                      {r.status === "success" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : r.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-700 truncate">
                          {r.task.filename}
                        </p>
                        <p className="text-slate-400">
                          → {r.task.targetPlatformId}
                          {r.errorCode && (
                            <span className="text-red-500 ml-1">
                              - {r.errorCode}
                            </span>
                          )}
                          {r.archiveErrorCode && (
                            <span className="text-amber-600 ml-1">
                              - 远端成功，本地归档待处理：
                              {archiveErrorText(r.archiveErrorCode)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  onClick={dismissResult}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
