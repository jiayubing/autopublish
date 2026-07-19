import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  PlatformArticle,
  PlatformSubmitResult,
} from "../types";
import {
  buildPlatformPlan,
  submitPlatformPlan,
  stopPlatformSubmit,
  pausePlatformSubmit,
  getPlatformState,
  getPlatformSettingsStatus,
  onPlatformState,
  previewTrashedArticleQueueResidue,
  cleanupTrashedArticleQueueResidue,
} from "../electron-api";
import { usePlatformQueue } from "../workspace-data-store";
import type { HepanProviderStatus, PlatformStatus } from "../types";
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
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// hepan is the technical ID for 蓝色河畔. We keep this mapping and do NOT
// create a separate "lanse" adapter. The display name is resolved via
// getPlatformQueue which uses PLATFORM_DISPLAY_NAMES in electron-api.ts.

const PLATFORM_ORDER = ["lieju", "toutiao", "hepan"] as const;

function archiveErrorText(value: PlatformArticle['archiveError'] | PlatformSubmitResult['results'][number]['archiveError']): string {
  if (typeof value === 'string') return value;
  return value?.message || value?.code || '本地归档失败';
}

export default function PlatformWorkbench({ onOpenArticleManagement }: { onOpenArticleManagement?: () => void } = {}) {
  const { snapshot: queueSnapshot, refresh: refreshQueue } = usePlatformQueue();
  const queue = queueSnapshot.queue;
  const platforms = queueSnapshot.platforms;
  const loading = queueSnapshot.loading;
  const [error, setError] = useState<string | null>(null);

  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(
    new Set()
  );
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<Set<string>>(
    new Set()
  );

  const [isConfirming, setIsConfirming] = useState(false);
  const [autoTrashRequested, setAutoTrashRequested] = useState(() => {
    try { return window.localStorage.getItem("auto-publish:auto-trash-after-publish") === "true"; } catch (_) { return false; }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [submitResult, setSubmitResult] =
    useState<PlatformSubmitResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string>("");
  const [platformState, setPlatformState] = useState<PlatformStatus>({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false });
  const [publishIntervalSeconds, setPublishIntervalSeconds] = useState(30);
  const [queueResidue, setQueueResidue] = useState<{ cleanableCount: number; reportedCount: number }>({ cleanableCount: 0, reportedCount: 0 });
  const [repairingResidue, setRepairingResidue] = useState(false);
  const [residuePhase, setResiduePhase] = useState<"idle" | "checking" | "cleaning">("idle");
  const [residueFeedback, setResidueFeedback] = useState<{ kind: "status" | "error"; text: string } | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem("auto-publish:auto-trash-after-publish", String(autoTrashRequested)); } catch (_) {}
  }, [autoTrashRequested]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const hasObservedRunningRef = useRef(false);
  const terminalQueueRevisionRef = useRef<number | null>(null);

  const hasArchiveFailure = useCallback((article: PlatformArticle) => Boolean(article.archiveError), []);
  const isSelectableArticle = useCallback((article: PlatformArticle) => article.sourceArticleState !== "trashed" && !hasArchiveFailure(article), [hasArchiveFailure]);
  const displayError = error || queueSnapshot.error;

  const loadQueue = useCallback(async () => {
    try {
      setError(null);
      await refreshQueue("manual");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    }
  }, [refreshQueue]);

  useEffect(() => {
    setSelectedArticles((current) => {
      const next = new Set([...current].filter((filePath) => queue.some((article) => article.filePath === filePath && isSelectableArticle(article))));
      return next.size === current.size ? current : next;
    });
  }, [isSelectableArticle, queue]);

  const inspectQueueResidue = useCallback(async () => {
    try {
      const report = await previewTrashedArticleQueueResidue();
      setQueueResidue({ cleanableCount: report.cleanableCount, reportedCount: report.reportedCount });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "无法检查已删除文章队列残留");
    }
  }, []);

  useEffect(() => { void inspectQueueResidue(); }, [inspectQueueResidue, queue.length]);

  const repairQueueResidue = async () => {
    if (repairingResidue) return;
    setRepairingResidue(true);
    setResiduePhase("checking");
    setResidueFeedback(null);
    try {
      const report = await previewTrashedArticleQueueResidue();
      setQueueResidue({ cleanableCount: report.cleanableCount, reportedCount: report.reportedCount });
      if (!report.cleanableCount) {
        setResidueFeedback({ kind: "error", text: report.reportedCount ? `发现 ${report.reportedCount} 项需处理残留。请进入“文章管理”的“需处理”阶段查看原因和允许动作。` : "未发现已删除源文章的可修复队列残留。" });
        return;
      }
      if (!window.confirm(`发现 ${report.cleanableCount} 项可安全清理的已删除源文章队列残留。明确失败/queued 项会按身份和哈希校验处理，其他 ${report.reportedCount} 项只报告不更改。确认清理？`)) return;
      setResiduePhase("cleaning");
      setResidueFeedback({ kind: "status", text: "清理中…" });
      const result = await cleanupTrashedArticleQueueResidue();
      const refreshed = await previewTrashedArticleQueueResidue();
      setQueueResidue({ cleanableCount: refreshed.cleanableCount, reportedCount: refreshed.reportedCount });
      await loadQueue();
      const cleanedCount = Number(result.cleanedCount) || 0;
      const failedCount = Number(result.failedCount ?? result.failedItems?.length ?? 0) || 0;
      const remainingCount = Number(result.remainingCount ?? (refreshed.cleanableCount + refreshed.reportedCount)) || 0;
      const reasons = [...new Set((result.failedItems || []).map((item) => item.reasonCode).filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
      if (failedCount > 0 || cleanedCount === 0) {
        const reason = reasons.length ? `原因：${reasons.join("、")}` : "原因：存在状态冲突或队列身份变化";
        setResidueFeedback({ kind: "error", text: cleanedCount > 0 ? `部分清理：已清理 ${cleanedCount} 项，仍有 ${Math.max(failedCount, remainingCount)} 项未清理。${reason}` : `未清理任何残留项。仍有 ${Math.max(failedCount, remainingCount)} 项需要处理。${reason}` });
      } else {
        setResidueFeedback({ kind: "status", text: `已清理 ${cleanedCount} 项已删除源文章队列残留。` });
      }
    } catch (e: unknown) {
      const value = e as { code?: unknown; reasonCode?: unknown; message?: unknown };
      const reason = typeof value.code === "string" ? value.code : typeof value.reasonCode === "string" ? value.reasonCode : typeof value.message === "string" ? value.message : "清理服务返回失败";
      setResidueFeedback({ kind: "error", text: `已删除文章队列残留清理失败。原因：${reason}` });
    } finally {
      setResiduePhase("idle");
      setRepairingResidue(false);
    }
  };

  useEffect(() => {
    let active = true;
    const applyPlatformState = (state: PlatformStatus) => {
      setPlatformState(state);
      const phase = state.phase || state.status || "";
      const waiting = phase === "waiting-interval" || phase === "waiting_interval";
      const running = phase === "running" || waiting || phase === "stopping" || state.isPlatformRunning === true;
      if (running) hasObservedRunningRef.current = true;
      setIsSubmitting(running);
      if (waiting) {
        setSubmitStatus("等待下一篇河畔文章…");
      } else if (phase === "running") {
        setSubmitStatus("正在投稿…");
      } else if (phase === "stopping") {
        setSubmitStatus("正在停止投稿…");
      } else if ((phase === "completed" || phase === "idle" || phase === "failed" || phase === "stopped") && !running) {
        setSubmitStatus("");
        setIsSubmitting(false);
        const queueRevision = state.queueRevision;
        if (hasObservedRunningRef.current && typeof queueRevision === "number" && Number.isFinite(queueRevision) && terminalQueueRevisionRef.current !== queueRevision) {
          terminalQueueRevisionRef.current = queueRevision;
          hasObservedRunningRef.current = false;
          void refreshQueue("submit-terminal").catch(() => {});
        }
      }
    };
    getPlatformSettingsStatus<HepanProviderStatus>("hepan").then((status) => {
      if (active && Number.isInteger(status.publishIntervalSeconds)) setPublishIntervalSeconds(status.publishIntervalSeconds);
    }).catch(() => { /* Settings may be unavailable for non-desktop fixtures. */ });
    getPlatformState().then((state) => { if (active) applyPlatformState(state); }).catch(() => {});
    const unsubscribe = onPlatformState((state) => {
      if (!active) return;
      applyPlatformState(state);
    });
    return () => { active = false; unsubscribe(); };
  }, [refreshQueue]);

  const groupedArticles: Record<string, PlatformArticle[]> = {};
  for (const article of queue) {
    const key = article.sourcePlatformId || article.platformId || "unknown";
    if (!groupedArticles[key]) groupedArticles[key] = [];
    groupedArticles[key].push(article);
  }

  const sortedGroups = PLATFORM_ORDER.filter((id) => groupedArticles[id]);

  const toggleArticle = (filePath: string) => {
    const article = queue.find((item) => item.filePath === filePath);
    if (!article || !isSelectableArticle(article)) return;
    setSelectedArticles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const toggleSelectAllInGroup = (platformId: string) => {
    const groupArticles = groupedArticles[platformId] || [];
    const selectableGroup = groupArticles.filter(isSelectableArticle);
    if (!selectableGroup.length) return;
    const allSelected = selectableGroup.every((a) =>
      selectedArticles.has(a.filePath)
    );
    setSelectedArticles((prev) => {
      const next = new Set(prev);
      for (const a of selectableGroup) {
        if (allSelected) next.delete(a.filePath);
        else next.add(a.filePath);
      }
      return next;
    });
  };

  const togglePlatform = (platformId: string) => {
    setSelectedPlatformIds((prev) => {
      const next = new Set(prev);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      return next;
    });
  };

  const toggleGroupCollapse = (platformId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      return next;
    });
  };

  const selectedArticleList = queue.filter((a) => isSelectableArticle(a) &&
    selectedArticles.has(a.filePath)
  );
  const selectedPlatformList = platforms.filter((p) =>
    selectedPlatformIds.has(p.id)
  );

  const taskCount =
    selectedArticleList.length * selectedPlatformIds.size;
  const selectedHepan = selectedPlatformIds.has("hepan");
  const hepanArticleCount = selectedHepan ? selectedArticleList.length : 0;
  const minimumHepanWaitSeconds = Math.max(0, hepanArticleCount - 1) * publishIntervalSeconds;
  const canSubmit =
    selectedArticleList.length > 0 && selectedPlatformIds.size > 0;

  const handlePause = async () => {
    setSubmitStatus("已暂停 — 正在关闭浏览器...");
    try { await pausePlatformSubmit(); } catch (_) {}
    setSubmitStatus("");
    setIsSubmitting(false);
  };

  const handleStop = async () => {
    setIsStopping(true);
    try { await stopPlatformSubmit(); } catch (_) {}
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsConfirming(false);
    setIsSubmitting(true);
    setError(null);
      setSubmitStatus("正在构建提交计划...");
    try {
      const plan = await buildPlatformPlan({
        articles: selectedArticleList,
        platformIds: [...selectedPlatformIds],
      });
      setSubmitStatus(`正在提交 ${plan.taskCount} 个任务，请稍候...`);
      const result = await submitPlatformPlan(plan, { autoTrash: autoTrashRequested });
      setSubmitStatus("");
      setSubmitResult(result);
      setShowResult(true);
    } catch (e: unknown) {
      setSubmitStatus("");
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      try { await refreshQueue("submit-terminal"); } catch (_) {}
      setIsSubmitting(false);
      setIsStopping(false);
    }
  };

  const resultOk = submitResult?.ok ?? 0;
  const resultFail = submitResult?.fail ?? 0;
  const resultSkipped = submitResult?.skipped ?? 0;
  const waitingSeconds = Math.max(0, Math.ceil((platformState.waitRemainingMs || 0) / 1000));
  const nextTaskLabel = platformState.nextTask?.filename || platformState.task?.filename || "下一篇";
  const platformPhase = platformState.phase || platformState.status || "";
  const isWaitingInterval = platformPhase === "waiting-interval" || platformPhase === "waiting_interval";

  const dismissResult = () => {
    setShowResult(false);
    setSubmitResult(null);
    setSubmitStatus("");
  };

  return (
    <div className="flex flex-col h-full">
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
          disabled={loading || isSubmitting}
          className="flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg shadow-2xs transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
          <span>刷新队列</span>
        </button>
        {queueResidue.cleanableCount > 0 && <button type="button" onClick={() => void repairQueueResidue()} disabled={loading || isSubmitting || repairingResidue} className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">{repairingResidue ? (residuePhase === "checking" ? "检查中…" : "清理中…") : `检查并清理已删除文章残留 · 安全收尾 (${queueResidue.cleanableCount})`}</button>}
        {queueResidue.reportedCount > 0 && <button type="button" onClick={onOpenArticleManagement} disabled={loading || isSubmitting} className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50">查看需处理项 ({queueResidue.reportedCount})</button>}
      </div>

      {residueFeedback && <div role={residueFeedback.kind === "error" ? "alert" : "status"} aria-live={residueFeedback.kind === "error" ? "assertive" : "polite"} className={`mb-3 rounded border p-3 text-xs ${residueFeedback.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}>{residueFeedback.text}</div>}

      {displayError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{displayError}</span>
          <button
            onClick={() => setError(null)}
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
                  const allSelected = selectableQueue.length > 0 && selectableQueue.every((a) =>
                    selectedArticles.has(a.filePath)
                  );
                  if (allSelected) {
                    setSelectedArticles(new Set());
                  } else {
                      setSelectedArticles(new Set(selectableQueue.map((a) => a.filePath)));
                  }
                }}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium"
              >
                {queue.filter(isSelectableArticle).length > 0 && queue.filter(isSelectableArticle).every((a) => selectedArticles.has(a.filePath))
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
                  const selectableGroup = groupArticles.filter(isSelectableArticle);
                  const allInGroupSelected =
                    selectableGroup.length > 0 &&
                    selectableGroup.every((a) =>
                      selectedArticles.has(a.filePath)
                    );
                  const someInGroupSelected = selectableGroup.some((a) =>
                    selectedArticles.has(a.filePath)
                  );

                  const displayName =
                    platforms.find((p) => p.id === platformId)
                      ?.displayName || platformId;

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
                              key={article.filePath}
                              onClick={() =>
                                toggleArticle(article.filePath)
                              }
                              disabled={!isSelectableArticle(article)}
                              title={article.archiveError ? "远端已发布，本地归档待处理，禁止再次远端投稿" : article.sourceArticleState === "trashed" ? `源文章已删除，禁止投稿${article.reasonCode ? `：${article.reasonCode}` : ""}` : undefined}
                              className={`w-full flex items-center space-x-2.5 px-3.5 py-2 transition-colors text-left ${
                                selectedArticles.has(article.filePath)
                                  ? "bg-blue-50/60"
                                  : article.archiveError ? "bg-amber-50/60" : article.sourceArticleState === "trashed" ? "bg-rose-50/60" : "hover:bg-slate-50"
                              }`}
                            >
                              {article.archiveError ? (
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                              ) : article.sourceArticleState === "trashed" ? (
                                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                              ) : selectedArticles.has(
                                article.filePath
                              ) ? (
                                <CheckSquare className="w-4 h-4 text-blue-500 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-700 truncate">
                                  {article.title ||
                                    article.filename}
                                </p>
                                <p className="text-xs text-slate-400 truncate">
                                  {article.archiveError ? "远端已发布，本地归档待处理（禁止重投）" : article.sourceArticleState === "trashed" ? `源文章已删除，禁止投稿${article.reasonCode ? ` · ${article.reasonCode}` : ""}` : article.filename}
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
                {platforms.map((platform) => (
                  <button
                    key={platform.id}
                    onClick={() => togglePlatform(platform.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      selectedPlatformIds.has(platform.id)
                        ? "border-blue-300 bg-blue-50/60 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
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
                        <p className="text-xs text-slate-400">
                          扫描目录: {platform.scanDir}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
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
      {submitStatus && (
        <div className="mt-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isWaitingInterval ? <Clock className="w-4 h-4 text-blue-500 shrink-0" /> : <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
            <span>{isWaitingInterval ? `等待下一篇河畔文章：${waitingSeconds} 秒（${nextTaskLabel}）` : submitStatus}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handlePause}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-md shadow-sm transition-all active:scale-95 flex items-center space-x-1"
            >
              <Pause className="w-3 h-3" />
              <span>暂停</span>
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
          disabled={!canSubmit || isSubmitting}
          className="flex items-center space-x-1.5 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white text-sm font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none disabled:shadow-none"
        >
          <Send className="w-4 h-4" />
          <span>
            {isSubmitting ? "提交中..." : `确认提交 (${taskCount} 任务)`}
          </span>
        </button>
      </div>

      {/* Confirmation overlay */}
      <AnimatePresence>
        {isConfirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
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
                  disabled={isSubmitting}
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
                        key={a.filePath}
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
                    <p className="text-xs text-red-500">
                      请先选择至少一篇文章
                    </p>
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
                  {selectedHepan && <p className="mt-1 text-xs text-indigo-700">河畔文章：{hepanArticleCount} 篇 · 配置间隔：{publishIntervalSeconds} 秒 · 最少等待：{minimumHepanWaitSeconds} 秒（第一篇立即执行）</p>}
                  {selectedHepan && publishIntervalSeconds === 0 && <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">0 秒不增加等待，但存在河畔频率限制风险。</p>}
                </div>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <input type="checkbox" checked={autoTrashRequested} onChange={(event) => setAutoTrashRequested(event.target.checked)} disabled={isSubmitting} className="mt-0.5" />
                  <span><strong>全部目标发布成功后自动移入回收站</strong><span className="mt-1 block text-slate-500">默认关闭；远端已发布内容不会撤回，发布记录和标题快照会保留。失败、待确认或本地归档失败时不会自动回收。</span></span>
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
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                  className="flex items-center space-x-1.5 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 disabled:pointer-events-none"
                >
                  {isSubmitting ? (
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
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
                    <p className="text-xs text-emerald-600 font-medium">
                      成功
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                    <p className="text-2xl font-bold text-red-500">
                      {resultFail}
                    </p>
                    <p className="text-xs text-red-500 font-medium">
                      失败
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
                    <p className="text-2xl font-bold text-amber-500">
                      {resultSkipped}
                    </p>
                    <p className="text-xs text-amber-500 font-medium">
                      跳过
                    </p>
                  </div>
                </div>
                {submitResult.archiveSummary && submitResult.archiveSummary.failed > 0 && <div role="status" className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">远端已发布，本地归档待处理：{submitResult.archiveSummary.failed} 项。队列中的这些文章已禁止再次远端投稿。</div>}
                {submitResult.trashDisposition === "offer_trash" && <div role="status" className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">已发布 {submitResult.trashSummary?.offeredCount || resultOk} 篇，可移入回收站。<button type="button" onClick={onOpenArticleManagement} className="ml-2 rounded border border-emerald-300 px-2 py-1 font-semibold">打开文章管理</button></div>}
                {submitResult.trashDisposition === "auto_trash_blocked" && <div role="alert" className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">自动回收未执行：存在失败、待确认、活动投稿或本地归档待处理项。远端已发布结果保持不变，可稍后从文章管理手动回收。</div>}
                {submitResult.trashDisposition === "auto_trash_requested" && <div role="status" className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">已发布目标全部满足条件，文章本地副本已按确认策略移入回收站；发布记录继续保留。</div>}

                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {submitResult.results.map((r, i) => (
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
                          {r.error && (
                            <span className="text-red-500 ml-1">
                              - {r.error}
                            </span>
                          )}
                          {r.archiveError && <span className="text-amber-600 ml-1">- 远端成功，本地归档待处理：{archiveErrorText(r.archiveError)}</span>}
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
