import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  articleSelectionKey,
  groupArticlesByTemplate,
  selectableArticles,
} from "../../article-history-logic";
import type {
  ArticleRemovalTransaction,
  ArticleTrashImpactItem,
  ArticleTrashPreview,
  ArticleTrashRecord,
  PublicationArchiveEntry,
  PublicationHistoryRecord,
} from "../../types/publication";
import type { GeneratedContentArticle } from "../../types/generation";
import type { MediaResource } from "../../types/media";
import { type ArticleWorkflowFilter } from "../../article-workflow";
import type {
  ArticleManagementReadModel,
  GeneratedArticlesViewProps as GeneratedArticlesViewPropsBase,
} from "./GeneratedArticlesView.types";
import { formatBeijingTime } from "../../time-format";
import PublicationHistoryDrawer from "./PublicationHistoryDrawer";
import AccountProfileSelector from "./AccountProfileSelector";
import GeneratedArticlesList from "./GeneratedArticlesList";
import ArticleTrashPanel from "./ArticleTrashPanel";
import ClientLiejuPublicationProfileEditor from "./ClientLiejuPublicationProfileEditor";
import PaidMediaPreflightDialog from "./PaidMediaPreflightDialog";
import { useConfirmation } from "../../confirmation";
import { isContentCommandStaleResult } from "../../content-command-result";
import { useSubmissionIntakeSession } from "./use-submission-intake-session";

type GeneratedArticlesViewProps = {
  management: ArticleManagementReadModel;
} & Omit<GeneratedArticlesViewPropsBase, "management">;

function selectionKey(article: GeneratedContentArticle) {
  return articleSelectionKey(article);
}

function transactionIdOf(
  transaction: ArticleRemovalTransaction | null | undefined,
): string | null {
  const value = transaction?.transactionId || transaction?.id;
  return typeof value === "string" && value ? value : null;
}

function transactionStatusOf(
  transaction:
    Pick<ArticleRemovalTransaction, "status" | "phase"> | null | undefined,
): string {
  if (!transaction) return "";
  if (transaction.status === "pending_recovery")
    return transaction.phase === "needs_repair"
      ? "needs_repair"
      : "pending_auto_recovery";
  return transaction.status;
}

function transactionReason(
  transaction: ArticleRemovalTransaction | null,
): string {
  return transaction?.reasonCode || transaction?.errorCode || "状态冲突";
}

export default function GeneratedArticlesView({
  clientId,
  workspaceScopeKey,
  client,
  saveClientLiejuPublicationProfile,
  management,
  query,
  commands,
  commandStates,
  removal,
  watchRemovalTransaction,
  stageFilter = "all",
  generationBatchId,
  articleId,
  onClearGenerationBatchFilter,
  onGenerationBatchFilterChange,
  dirtyArticleId,
  mediaResources = [],
  onArticleSelect,
  onStageFilterChange,
  onOpenOrders,
}: GeneratedArticlesViewProps) {
  const { confirm } = useConfirmation();
  const {
    articles,
    trash,
    publicationRecords,
    publishedArchives = [],
    workflowByArticle: snapshotWorkflowByArticle,
    submissionPlatforms: allSubmissionPlatforms,
  } = management;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [selectedStage, setSelectedStage] = useState<
    ArticleWorkflowFilter
  >(stageFilter);
  const submissionPlatforms = useMemo(
    () =>
      allSubmissionPlatforms.filter((platform) => platform.contentQueueImport),
    [allSubmissionPlatforms],
  );
  const quotedMediaResources = useMemo(
    () => mediaResources.filter((resource) => typeof resource.price === "number"),
    [mediaResources],
  );
  const [drawerArticle, setDrawerArticle] =
    useState<GeneratedContentArticle | null>(null);
  const clientIdRef = useRef(clientId);
  const mountedRef = useRef(true);
  const lastNonTrashStageRef = useRef<ArticleWorkflowFilter>(
    stageFilter === "trash" ? "all" : stageFilter,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const visibleError = error || query.error?.userMessage || "";
  const [trashPreview, setTrashPreview] = useState<ArticleTrashPreview | null>(
    null,
  );
  const [trashFeedback, setTrashFeedback] = useState<{
    kind: "status" | "error";
    text: string;
  } | null>(null);
  const removalTransaction = removal.transaction;
  const removalTransactionId = removal.transactionId;
  clientIdRef.current = clientId;

  const commandBusy = useCallback(
    (...names: string[]) =>
      names.some((name) => commandStates[name]?.busy === true),
    [commandStates],
  );

  function isCurrentClient(requestedClientId: string): boolean {
    return mountedRef.current && clientIdRef.current === requestedClientId;
  }

  useEffect(() => {
    setSelectedStage(stageFilter);
    if (stageFilter !== "trash")
      lastNonTrashStageRef.current = stageFilter;
  }, [stageFilter]);

  useEffect(() => {
    setSelected([]);
  }, [generationBatchId]);

  useEffect(() => {
    if (!articleId) return;
    const target = articles.find((article) => article.id === articleId);
    if (target) setDrawerArticle(target);
  }, [articleId, articles]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetClientState = useCallback(() => {
    setError("");
    setTrashFeedback(null);
    setTrashPreview(null);
    setDrawerArticle(null);
  }, []);

  const updateSelected = useCallback((next: React.SetStateAction<string[]>) => {
    setSelected((current) =>
      typeof next === "function" ? next(current) : next,
    );
  }, []);

  useEffect(() => {
    resetClientState();
  }, [clientId, resetClientState]);

  const publicationRecordsByArticle = useMemo(() => {
    const grouped = new Map<string, PublicationHistoryRecord[]>();
    publicationRecords.forEach((record) => {
      if (!record.articleId) return;
      grouped.set(record.articleId, [
        ...(grouped.get(record.articleId) || []),
        record,
      ]);
    });
    return grouped;
  }, [publicationRecords]);
  const publicationArchivesByArticle = useMemo(() => {
    const grouped = new Map<string, PublicationArchiveEntry[]>();
    publishedArchives.forEach((archive) => {
      const articleId = archive.publicationEvidenceV1.articleIdentityV1.articleId;
      grouped.set(articleId, [
        ...(grouped.get(articleId) || []),
        archive,
      ]);
    });
    return grouped;
  }, [publishedArchives]);
  const workflowByArticle = useMemo(
    () =>
      new Map(
        articles.map((article) => [
          article.id,
          snapshotWorkflowByArticle[article.id],
        ]),
      ),
    [articles, snapshotWorkflowByArticle],
  );
  const generationBatches = useMemo(
    () =>
      [...new Set(articles.map((article) => article.generationBatchId).filter(Boolean))].sort(),
    [articles],
  );

  function workflowForArticle(article: GeneratedContentArticle) {
    return workflowByArticle.get(article.id);
  }

  function canSubmitArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    const allowed =
      workflow?.operations?.submit?.allowed ??
      workflow?.locks.canSubmit;
    return (
      allowed === true && !(dirtyArticleId && article.id === dirtyArticleId)
    );
  }

  function canTrashArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    const allowed =
      workflow?.operations?.trash?.allowed ?? workflow?.locks.canTrash;
    return allowed === true && !isPublishedArticle(article);
  }

  function isArticleSelectable(article: GeneratedContentArticle): boolean {
    return (
      selectableArticles([article], clientId).length > 0 &&
      (canSubmitArticle(article) || canTrashArticle(article))
    );
  }

  function isPublishedArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    return workflow?.stage === "published";
  }

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return articles.filter((article) => {
      const stageMatches =
        selectedStage === "all" ||
        workflowByArticle.get(article.id)?.stage === selectedStage;
      const batchMatches =
        !generationBatchId || article.generationBatchId === generationBatchId;
      const createdDate = article.createdAt.slice(0, 10);
      const createdFromMatches = !createdFrom || createdDate >= createdFrom;
      const createdToMatches = !createdTo || createdDate <= createdTo;
      const textMatches =
        !query ||
        `${article.title} ${article.content} ${article.platform} ${article.templateId} ${article.templateSnapshot?.name || ""} ${article.templateSnapshot?.scenario || ""} ${article.templateSnapshot?.body || ""}`
          .toLowerCase()
          .includes(query);
      return stageMatches && batchMatches && textMatches && createdFromMatches && createdToMatches;
    });
  }, [articles, createdFrom, createdTo, filter, generationBatchId, selectedStage, workflowByArticle]);
  const groups = useMemo(() => groupArticlesByTemplate(filtered), [filtered]);
  const operable = useMemo(
    () => selectableArticles(filtered, clientId).filter(isArticleSelectable),
    [filtered, clientId, workflowByArticle, dirtyArticleId],
  );
  const selectedArticles = filtered.filter(
    (article) =>
      selected.includes(selectionKey(article)) && isArticleSelectable(article),
  );
  const selectedDirtyArticle = selectedArticles.find((article) =>
    Boolean(dirtyArticleId && article.id === dirtyArticleId),
  );
  const selectedSubmittableArticles = selectedDirtyArticle
    ? []
    : selectedArticles.filter(canSubmitArticle);
  const selectedTrashableArticles = selectedArticles.filter(canTrashArticle);
  const submissionSession = useSubmissionIntakeSession({
    scopeKey: workspaceScopeKey,
    availableArticleRefs: selectedSubmittableArticles.map((article) => ({
      clientId: article.clientId,
      articleId: article.id,
    })),
    previewRegularQueueAdmission: commands.previewRegularQueueAdmission,
    admitRegularQueueItems: commands.admitRegularQueueItems,
    previewPaidMediaPreflight: commands.previewPaidMediaPreflight,
    confirmPaidMediaBatch: commands.confirmPaidMediaBatch,
    commandStates,
    confirm,
    onCommitted: () => updateSelected([]),
  });
  const intake = submissionSession.snapshot;
  const intakeIntents = submissionSession.intents;
  const removalStatus = transactionStatusOf(removalTransaction);
  const removalTransactionOpen =
    removalStatus === "pending_auto_recovery" ||
    removalStatus === "pending_recovery" ||
    removalStatus === "needs_repair";
  const removalSubmitDisabled = Boolean(
    removalTransactionId && (!removalTransaction || removalTransactionOpen),
  );

  function impactPlatform(item: ArticleTrashImpactItem): string {
    return (
      item.displayName || item.targetPlatformId || item.platformId || "未知平台"
    );
  }

  function toggleArticle(article: GeneratedContentArticle) {
    if (!isArticleSelectable(article)) return;
    const key = selectionKey(article);
    updateSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function toggleGroup(groupArticles: GeneratedContentArticle[]) {
    const ids = selectableArticles(groupArticles, clientId)
      .filter(isArticleSelectable)
      .map(selectionKey);
    const allSelected =
      ids.length > 0 && ids.every((id) => selected.includes(id));
    updateSelected((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  function openSubmissionIntake() {
    if (!selectedSubmittableArticles.length || selectedDirtyArticle) return;
    intakeIntents.open(
      selectedSubmittableArticles.map((article) => ({
        clientId: article.clientId,
        articleId: article.id,
      })),
    );
  }

  function openArticle(
    article: GeneratedContentArticle,
    source?: HTMLElement | null,
  ) {
    const workflow = workflowForArticle(article);
    if (!workflow) return;
    onArticleSelect(article, source, workflow.stage === "published");
  }

  async function previewTrashSelections(
    selections: Array<{ clientId: string; articleId: string }>,
  ) {
    if (!selections.length) return;
    const requestedClientId = clientId;
    if (commandBusy("previewContentArticleRemoval")) return;
    setError("");
    setTrashFeedback(null);
    try {
      const preview = await commands.previewContentArticleRemoval({
        selections,
      });
      if (isContentCommandStaleResult(preview)) return;
      if (!isCurrentClient(requestedClientId)) return;
      const existingTransaction =
        preview.openTransaction || preview.transaction || null;
      const existingTransactionId =
        preview.openTransactionId ||
        preview.transactionId ||
        transactionIdOf(existingTransaction);
      if (existingTransactionId)
        await watchRemovalTransaction(existingTransactionId);
      if (existingTransactionId)
        setTrashFeedback({
          kind: "status",
          text: "已存在相同删除事务，正在复用并读取其状态；不会重复创建。",
        });
      if (!preview.canCommit || existingTransactionId) {
        setTrashPreview(preview);
        return;
      }
      if (
        await confirm({
          title: "确认移入回收站",
          message: `将 ${preview.articleCount} 篇文章移入回收站；发布成功的文章不会进入此操作，发布记录会保留。`,
          confirmLabel: "确认移入回收站",
          tone: "danger",
        })
      )
        await commitTrash(preview);
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(value instanceof Error ? value.message : "回收站预检失败");
    }
  }

  async function trashSelected() {
    await previewTrashSelections(
      selectedTrashableArticles.map((article) => ({
        clientId: article.clientId,
        articleId: article.id,
      })),
    );
  }

  async function commitTrash(previewOverride?: ArticleTrashPreview) {
    const activePreview = previewOverride || trashPreview;
    if (!activePreview || !activePreview.canCommit || removalSubmitDisabled)
      return;
    const requestedClientId = clientId;
    if (commandBusy("trashContentArticles")) return;
    setError("");
    try {
      const selections =
        activePreview.selections ||
        selectedTrashableArticles.map((article) => ({
          clientId: article.clientId,
          articleId: article.id,
        }));
      const result = await commands.trashContentArticles({
        selections,
        token: activePreview.token,
        confirmed: true,
      });
      if (
        isContentCommandStaleResult(result) ||
        !isCurrentClient(requestedClientId)
      )
        return;
      const resultTransaction =
        result.transaction ||
        (result.transactionId
          ? {
              transactionId: result.transactionId,
              status: result.status || "committed",
              phase: result.phase,
              errorCode: result.errorCode,
              reasonCode: result.reasonCode,
              articleCount: result.articleCount,
            }
          : null);
      const resultStatus = transactionStatusOf(resultTransaction);
      const resultTransactionId =
        result.transactionId || transactionIdOf(resultTransaction);
      if (resultTransactionId)
        await watchRemovalTransaction(resultTransactionId);
      setTrashPreview(null);
      updateSelected([]);
      if (
        resultStatus === "pending_auto_recovery" ||
        resultStatus === "pending_recovery"
      ) {
        setTrashFeedback({
          kind: "status",
          text: `已确认移入回收站 ${result.articleCount || selections.length} 篇，删除事务正在自动恢复${resultTransaction?.updatedAt ? `（最近更新：${formatBeijingTime(resultTransaction.updatedAt)})` : ""}。`,
        });
      } else if (resultStatus === "needs_repair") {
        setTrashFeedback({
          kind: "error",
          text: `删除事务需要修复：${transactionReason(resultTransaction)}`,
        });
      } else {
        setTrashFeedback({
          kind: "status",
          text: `已将 ${result.articleCount || selections.length} 篇文章移入回收站；发布记录继续保留，恢复文章不会重新加入投稿队列。`,
        });
      }
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setTrashFeedback({
          kind: "error",
          text:
            value instanceof Error
              ? value.message
              : "移入回收站失败；未完成的事务可稍后恢复",
        });
    }
  }

  async function retryRemovalTransaction() {
    if (!removalTransactionId) return;
    const requestedClientId = clientId;
    if (commandBusy("retryContentArticleRemovalTransaction")) return;
    setTrashFeedback(null);
    try {
      const next = await commands.retryContentArticleRemovalTransaction({
        transactionId: removalTransactionId,
      });
      if (
        isContentCommandStaleResult(next) ||
        !isCurrentClient(requestedClientId)
      )
        return;
      await watchRemovalTransaction(removalTransactionId);
      const status = transactionStatusOf(next);
      setTrashFeedback(
        status === "needs_repair"
          ? {
              kind: "error",
              text: `删除事务需要修复：${transactionReason(next)}`,
            }
          : { kind: "status", text: "已提交删除事务修复，正在读取最新状态。" },
      );
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setTrashFeedback({
          kind: "error",
          text: value instanceof Error ? value.message : "删除事务修复失败",
        });
    }
  }

  async function restoreOne(entry: ArticleTrashRecord) {
    const requestedClientId = clientId;
    if (
      !(await confirm({
        title: "确认恢复文章",
        message: `确认恢复“${entry.titleSnapshot || entry.articleId}”？恢复文章不会重新加入投稿队列。`,
        confirmLabel: "确认恢复",
      }))
    )
      return;
    if (commandBusy("restoreContentArticle")) return;
    setError("");
    try {
      const result = await commands.restoreContentArticle({
        clientId: entry.clientId,
        articleId: entry.articleId,
      });
      if (
        isContentCommandStaleResult(result) ||
        !isCurrentClient(requestedClientId)
      )
        return;
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(value instanceof Error ? value.message : "恢复文章失败");
    }
  }

  async function permanentlyDeleteOne(entry: ArticleTrashRecord) {
    const requestedClientId = clientId;
    if (
      commandBusy(
        "preparePermanentDeleteContentArticle",
        "permanentlyDeleteContentArticle",
      )
    )
      return;
    setError("");
    let prepared;
    try {
      prepared = await commands.preparePermanentDeleteContentArticle({
        clientId: entry.clientId,
        articleId: entry.articleId,
      });
      if (isContentCommandStaleResult(prepared)) return;
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(value instanceof Error ? value.message : "永久删除预检失败");
      return;
    }
    if (
      !isCurrentClient(requestedClientId) ||
      !(await confirm({
        title: "确认永久删除文章",
        message: `永久删除“${entry.articleId}”？正文和 Markdown 将不可恢复。`,
        confirmLabel: "永久删除",
        tone: "danger",
      }))
    )
      return;
    if (
      !isCurrentClient(requestedClientId) ||
      requestedClientId !== entry.clientId
    )
      return;
    setError("");
    try {
      const result = await commands.permanentlyDeleteContentArticle({
        clientId: entry.clientId,
        articleId: entry.articleId,
        token: prepared.token,
      });
      if (
        isContentCommandStaleResult(result) ||
        !isCurrentClient(requestedClientId)
      )
        return;
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(value instanceof Error ? value.message : "永久删除文章失败");
    }
  }

  function toggleAll() {
    const ids = operable.map(selectionKey);
    const allSelected =
      ids.length > 0 && ids.every((id) => selected.includes(id));
    updateSelected((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  if (selectedStage === "trash")
    return (
      <ArticleTrashPanel
        trash={trash}
        visibleError={visibleError}
        commandBusy={commandBusy}
        onBack={() => {
          const next = lastNonTrashStageRef.current;
          setSelectedStage(next);
          onStageFilterChange?.(next);
        }}
        onRestore={(entry) => void restoreOne(entry)}
        onPermanentlyDelete={(entry) => void permanentlyDeleteOne(entry)}
      />
    );

  return (
    <div className="relative h-full w-full min-w-0 overflow-y-auto p-4">
      <div className="mb-4 grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
          <h2 aria-label="文章库" className="text-base font-semibold text-slate-800">
            文章库
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-5 text-slate-500">
            按文章当前阶段、生成批次和关键词筛选；编辑、发起投稿、进度与发布档案均从这里进入。
          </p>
          </div>
        </div>

        <ClientLiejuPublicationProfileEditor
          client={client}
          saveProfile={saveClientLiejuPublicationProfile}
        />

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)_auto_auto]">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选标题、平台或模板"
            aria-label="筛选文章库"
            className="h-9 min-w-0 w-full rounded-md border border-slate-300 px-2 text-xs"
          />
          <select
            aria-label="生成批次筛选"
            value={generationBatchId || ""}
            onChange={(event) =>
              onGenerationBatchFilterChange?.(event.target.value || null)
            }
            disabled={!generationBatches.length && !generationBatchId}
            className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs disabled:opacity-50"
          >
            <option value="">全部生成批次</option>
            {generationBatchId && !generationBatches.includes(generationBatchId) && (
              <option value={generationBatchId}>{generationBatchId}</option>
            )}
            {generationBatches.map((batchId) => (
              <option key={batchId} value={batchId}>{batchId}</option>
            ))}
          </select>
          <label className="flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-500">
            起始日期
            <input
              type="date"
              aria-label="文章创建起始日期"
              value={createdFrom}
              onChange={(event) => setCreatedFrom(event.target.value)}
              className="min-w-0 bg-transparent text-slate-700 outline-none"
            />
          </label>
          <label className="flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-500">
            结束日期
            <input
              type="date"
              aria-label="文章创建结束日期"
              value={createdTo}
              onChange={(event) => setCreatedTo(event.target.value)}
              className="min-w-0 bg-transparent text-slate-700 outline-none"
            />
          </label>
          {generationBatchId && (
            <div
              role="status"
              data-testid="generation-batch-filter"
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-800"
            >
              <span>当前筛选：生成批次 {generationBatchId}</span>
              {onClearGenerationBatchFilter && (
                <button
                  type="button"
                  onClick={onClearGenerationBatchFilter}
                  className="rounded border border-blue-200 px-2 py-1 text-blue-700"
                >
                  清除批次筛选
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openSubmissionIntake}
            disabled={!selectedSubmittableArticles.length || Boolean(selectedDirtyArticle)}
            title={selectedDirtyArticle ? "当前编辑文章有未保存修改，请先保存后投稿。" : undefined}
            className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            发起投稿 ({selectedSubmittableArticles.length})
          </button>
          <button
            type="button"
            onClick={toggleAll}
            disabled={!operable.length}
            className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"
          >
            全选当前结果
          </button>
          <button
            type="button"
            onClick={() => void trashSelected()}
            disabled={
              !selectedTrashableArticles.length ||
              commandBusy(
                "previewContentArticleRemoval",
                "trashContentArticles",
              ) ||
              removalSubmitDisabled
            }
            className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            移入回收站 ({selectedTrashableArticles.length})
          </button>
        </div>
        {intake.feedback && (
          <div
            role={intake.feedback.kind === "error" ? "alert" : "status"}
            aria-live={intake.feedback.kind === "error" ? "assertive" : "polite"}
            tabIndex={intake.feedback.kind === "error" ? -1 : undefined}
            className={`min-w-0 rounded border p-2 text-xs ${intake.feedback.kind === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
          >
            {intake.feedback.text}
          </div>
        )}
        {trashFeedback && (
          <div
            role={trashFeedback.kind === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`min-w-0 rounded border p-2 text-xs ${trashFeedback.kind === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
          >
            {trashFeedback.text}
          </div>
        )}
        {removalTransaction && (
          <div
            role={removalStatus === "needs_repair" ? "alert" : "status"}
            aria-live={
              removalStatus === "needs_repair" ? "assertive" : "polite"
            }
            className={`min-w-0 rounded border p-2 text-xs ${removalStatus === "needs_repair" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
          >
            {removalStatus === "pending_auto_recovery" ||
            removalStatus === "pending_recovery" ? (
              `删除事务正在自动恢复${removalTransaction.updatedAt ? ` · 最近更新：${formatBeijingTime(removalTransaction.updatedAt)}` : ""}`
            ) : removalStatus === "needs_repair" ? (
              <>
                <span>
                  删除事务需要修复：{transactionReason(removalTransaction)}
                </span>
                <button
                  type="button"
                  onClick={() => void retryRemovalTransaction()}
                  disabled={commandBusy(
                    "retryContentArticleRemovalTransaction",
                  )}
                  className="ml-2 rounded border border-rose-300 px-2 py-1 text-xs disabled:opacity-40"
                >
                  重试修复删除事务
                </button>
              </>
            ) : removalStatus === "superseded" ? (
              "删除事务已由现有事务复用并归档。"
            ) : (
              "删除事务已完成。"
            )}
          </div>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
          选择文章后点击“发起投稿”，在确认面板中选择普通平台目标或已报价的媒体资源。
        </div>
      </div>
      {visibleError && (
        <div
          role="alert"
          className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700"
        >
          {visibleError}
        </div>
      )}
      <GeneratedArticlesList
          groups={groups}
          visibleError={visibleError}
          clientId={clientId}
          collapsed={collapsed}
          selected={selected}
          workflowByArticle={workflowByArticle}
          isArticleSelectable={isArticleSelectable}
          isArticleSubmittable={canSubmitArticle}
          removalSubmitDisabled={removalSubmitDisabled}
          commandBusy={commandBusy}
          onToggleCollapsed={(key) =>
            setCollapsed((current) => ({
              ...current,
              [key]: current[key] === false,
            }))
          }
          onToggleGroup={toggleGroup}
          onToggleArticle={toggleArticle}
          onOpenArticle={openArticle}
          onOpenPublication={(article) => setDrawerArticle(article)}
          onOpenOrder={onOpenOrders}
        />
      {trashPreview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="移入回收站预检"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-800">
                  移入回收站预检
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  发布记录和标题快照会保留；已发布文章不会进入回收站，恢复文章也不会自动恢复投稿队列。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTrashPreview(null)}
                disabled={commandBusy("trashContentArticles")}
                aria-label="关闭回收站预检"
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-700">
              <div>
                文章数：<strong>{trashPreview.articleCount}</strong>
              </div>
              <div>仍在投稿/待确认：{trashPreview.blockedItems.length}</div>
              <div>发布记录和最小证据：保留</div>
            </div>
            {(trashPreview.openTransaction || trashPreview.transaction) && (
              <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                已存在相同删除事务，已复用现有事务；请查看上方状态，不会重复创建。
              </div>
            )}
            {trashPreview.blockedItems.length > 0 && (
              <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3">
                <div className="text-sm font-semibold text-rose-800">
                  阻止项（整批不可提交）
                </div>
                <ul className="mt-2 grid gap-1 text-xs text-rose-700">
                  {trashPreview.blockedItems.map((item, index) => (
                    <li key={`${item.articleId || "article"}-${index}`}>
                      {item.articleId || "文章"} · {impactPlatform(item)} ·{" "}
                      {item.reasonCode || item.status || "状态冲突"}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-rose-700">
                  请取消选择风险文章后重新预检。
                </p>
              </div>
            )}
            {trashPreview.canCommit && !removalSubmitDisabled && (
              <div className="mt-4 rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                确认后只会将文章内容移入回收站；投稿任务必须先在投稿中心安全结束，
                已发布文章和发布证据不会被清理。
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTrashPreview(null)}
                disabled={commandBusy("trashContentArticles")}
                className="rounded border border-slate-300 px-3 py-2 text-xs"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void commitTrash()}
                disabled={
                  !trashPreview.canCommit ||
                  commandBusy("trashContentArticles") ||
                  removalSubmitDisabled
                }
                className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {removalSubmitDisabled ? "已有开放删除事务" : "确认移入回收站"}
              </button>
            </div>
          </div>
        </div>
      )}
      <PublicationHistoryDrawer
        article={drawerArticle}
        records={
          drawerArticle
            ? publicationRecordsByArticle.get(drawerArticle.id) || []
            : []
        }
        archives={
          drawerArticle
            ? publicationArchivesByArticle.get(drawerArticle.id) || []
            : []
        }
        summary={
          drawerArticle
            ? workflowByArticle.get(drawerArticle.id)?.publicationSummary
            : undefined
        }
        onClose={() => setDrawerArticle(null)}
      />
      {intake.open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="发起投稿"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">发起投稿</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  当前选择 {intake.articleCount} 篇文章；确认前不会创建投稿批次或订单。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭发起投稿"
                onClick={intakeIntents.close}
                disabled={intake.mutationBusy}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
              >
                ×
              </button>
            </div>
            <div className="mt-4 flex gap-2" role="tablist" aria-label="投稿类型">
              <button
                type="button"
                role="tab"
                aria-selected={intake.mode === "regular"}
                onClick={() => intakeIntents.setMode("regular")}
                disabled={intake.mutationBusy}
                className={`rounded px-3 py-2 text-xs font-semibold ${intake.mode === "regular" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"}`}
              >
                普通平台
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={intake.mode === "paid"}
                onClick={() => intakeIntents.setMode("paid")}
                disabled={intake.mutationBusy}
                className={`rounded px-3 py-2 text-xs font-semibold ${intake.mode === "paid" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"}`}
              >
                付费媒体
              </button>
            </div>
            {intake.mode === "regular" ? (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-xs text-slate-600">
                  普通平台投稿目标
                  <select
                    aria-label="普通平台投稿目标"
                    value={intake.platformId}
                    onChange={(event) => intakeIntents.setRegularPlatform(event.target.value)}
                    disabled={intake.mutationBusy}
                    className="h-9 rounded border border-slate-300 px-2 text-sm"
                  >
                    <option value="">请选择一个平台</option>
                    {submissionPlatforms.map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.displayName || platform.id}
                      </option>
                    ))}
                  </select>
                </label>
                <AccountProfileSelector
                  platforms={submissionPlatforms}
                  platformId={intake.platformId}
                  value={intake.accountProfileId}
                  onChange={intakeIntents.setAccountProfile}
                />
                <button
                  type="button"
                  onClick={() => void intakeIntents.submitRegular()}
                  disabled={
                    !intake.articleCount ||
                    !intake.platformId ||
                    !intake.accountProfileId ||
                    intake.regularBusy
                  }
                  className="justify-self-end rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {intake.regularBusy ? "检查中…" : "确认发起投稿"}
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1 text-xs text-slate-600">
                  媒体资源
                  <select
                    aria-label="付费媒体资源"
                    value={intake.mediaResourceId}
                    disabled={!quotedMediaResources.length || intake.mutationBusy}
                    onChange={(event) => intakeIntents.setMediaResource(event.target.value)}
                    className="h-9 rounded border border-slate-300 px-2 text-sm"
                  >
                    <option value="">
                      {quotedMediaResources.length
                        ? "请选择已报价媒体资源"
                        : "暂无已报价媒体资源"}
                    </option>
                    {quotedMediaResources.map((resource: MediaResource) => (
                      <option key={resource.resourceId} value={resource.resourceId}>
                        {resource.name} {resource.price === null ? "" : `· ¥${resource.price.toFixed(2)}`}
                      </option>
                    ))}
                  </select>
                </label>
                {!intake.paidPreflight && (
                  <button
                    type="button"
                    onClick={() => void intakeIntents.previewPaid()}
                    disabled={!intake.mediaResourceId || intake.paidPreviewBusy}
                    className="justify-self-end rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {intake.paidPreviewBusy ? "检查中…" : "检查费用与文章"}
                  </button>
                )}
              </div>
            )}
            {intake.error && <p role="alert" className="mt-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{intake.error}</p>}
          </div>
        </div>
      )}
      {intake.paidPreflight && (
        <PaidMediaPreflightDialog
          model={intake.paidPreflight}
          busy={intake.paidConfirmBusy}
          error={intake.error}
          onClose={intakeIntents.closePaidPreflight}
          onConfirm={intakeIntents.confirmPaid}
        />
      )}
    </div>
  );
}
