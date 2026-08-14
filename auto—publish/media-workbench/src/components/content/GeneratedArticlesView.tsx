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
  ArticleAttentionItem,
  ArticleRemovalTransaction,
  ArticleTrashImpactItem,
  ArticleTrashPreview,
  ArticleTrashRecord,
  PublicationArchiveEntry,
  PublicationHistoryRecord,
} from "../../types/publication";
import type { GeneratedContentArticle } from "../../types/generation";
import { type ArticleWorkflowStage } from "../../article-workflow";
import type {
  ArticleManagementReadModel,
  GeneratedArticlesViewProps as GeneratedArticlesViewPropsBase,
} from "./GeneratedArticlesView.types";
import { formatBeijingTime } from "../../time-format";
import PublicationHistoryDrawer from "./PublicationHistoryDrawer";
import ArticleAttentionPanel from "./ArticleAttentionPanel";
import ArticleAttentionDetailDrawer from "./ArticleAttentionDetailDrawer";
import AccountProfileSelector from "./AccountProfileSelector";
import GeneratedArticlesList from "./GeneratedArticlesList";
import ArticleTrashPanel from "./ArticleTrashPanel";
import { useAttentionFeature } from "../../features/attention/use-attention-feature";
import { useConfirmation } from "../../confirmation";
import { isContentCommandStaleResult } from "../../content-command-result";

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
  management,
  query,
  commands,
  commandStates,
  removal,
  watchRemovalTransaction,
  stageFilter = "all",
  dirtyArticleId,
  selectedAttentionId,
  onArticleSelect,
  onStageFilterChange,
  onOpenOrders,
}: GeneratedArticlesViewProps) {
  const { confirm } = useConfirmation();
  const {
    articles,
    trash,
    submissionBatches,
    cancellationPlans,
    publicationRecords,
    publishedArchives = [],
    workflowByArticle: snapshotWorkflowByArticle,
    submissionPlatforms: allSubmissionPlatforms,
  } = management;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [selectedStage, setSelectedStage] = useState<
    ArticleWorkflowStage | "all"
  >(stageFilter);
  const submissionPlatforms = useMemo(
    () =>
      allSubmissionPlatforms.filter((platform) => platform.contentQueueImport),
    [allSubmissionPlatforms],
  );
  const [platformId, setPlatformId] = useState("");
  const [accountProfileId, setAccountProfileId] = useState("");
  const cancellationRequestIdRef = useRef(0);
  const [drawerArticle, setDrawerArticle] =
    useState<GeneratedContentArticle | null>(null);
  const [attentionDetail, setAttentionDetail] =
    useState<ArticleAttentionItem | null>(null);
  const [paidResolutionError, setPaidResolutionError] = useState("");
  const clientIdRef = useRef(clientId);
  const mountedRef = useRef(true);
  const lastNonTrashStageRef = useRef<ArticleWorkflowStage | "all">(
    stageFilter === "trash" ? "all" : stageFilter,
  );
  const { snapshot: attentionSnapshot, feature: attentionFeature } =
    useAttentionFeature(clientId);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const visibleError = error || query.error?.userMessage || "";
  const isAttentionStage = selectedStage === "failed";
  const [cancellationPending, setCancellationPending] = useState<{
    clientId: string;
    count: number;
  } | null>(null);
  const [batchFeedback, setBatchFeedback] = useState<{
    kind: "status" | "error";
    text: string;
  } | null>(null);
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
    if (stageFilter !== "trash") lastNonTrashStageRef.current = stageFilter;
  }, [stageFilter]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetClientState = useCallback(() => {
    setError("");
    setBatchFeedback(null);
    setTrashFeedback(null);
    setTrashPreview(null);
    setDrawerArticle(null);
    setAttentionDetail(null);
    cancellationRequestIdRef.current += 1;
    setCancellationPending(null);
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
  const publicationRecordById = useMemo(
    () => new Map(publicationRecords.map((record) => [record.publicationId, record])),
    [publicationRecords],
  );
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

  function workflowForArticle(article: GeneratedContentArticle) {
    return workflowByArticle.get(article.id);
  }

  function attentionTargetLabel(item: ArticleAttentionItem): string {
    const publication = item.publicationId
      ? publicationRecordById.get(item.publicationId)
      : undefined;
    const platform =
      item.displayName ||
      publication?.displayName ||
      item.platformId ||
      publication?.platformId ||
      "未指定平台";
    const account = /(?:^|:)account:(.+)$/.exec(
      publication?.targetKey || "",
    )?.[1];
    return `${platform} / ${account || "账号未记录"}`;
  }

  function canQueueArticle(article: GeneratedContentArticle): boolean {
    const workflow = workflowForArticle(article);
    const allowed =
      workflow?.operations?.queue?.allowed ?? workflow?.locks.canQueue;
    return (
      allowed === true && !(dirtyArticleId && article.id === dirtyArticleId)
    );
  }

  function pendingRegularQueueItemsForArticle(
    article: GeneratedContentArticle,
  ) {
    return submissionBatches.flatMap((batch) =>
      batch.items
        .filter(
          (item) =>
            item.articleId === article.id &&
            item.status === "queued" &&
            Boolean(item.itemId && item.queueGroupId),
        )
        .map((item) => ({
          articleRef: { clientId, articleId: article.id },
          itemId: item.itemId as string,
          batchId: batch.id,
          ...(item.targetKey ? { targetKey: item.targetKey } : {}),
        })),
    );
  }

  function canRemovePendingArticle(article: GeneratedContentArticle): boolean {
    return pendingRegularQueueItemsForArticle(article).length > 0;
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
      (canQueueArticle(article) ||
        canTrashArticle(article) ||
        canRemovePendingArticle(article))
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
      const textMatches =
        !query ||
        `${article.title} ${article.content} ${article.platform} ${article.templateId} ${article.templateSnapshot?.name || ""} ${article.templateSnapshot?.scenario || ""} ${article.templateSnapshot?.body || ""}`
          .toLowerCase()
          .includes(query);
      return stageMatches && textMatches;
    });
  }, [articles, filter, selectedStage, workflowByArticle]);
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
  const selectedQueueableArticles = selectedDirtyArticle
    ? []
    : selectedArticles.filter(canQueueArticle);
  const selectedPendingQueueItems = selectedArticles.flatMap(
    pendingRegularQueueItemsForArticle,
  );
  const selectedTrashableArticles = selectedArticles.filter(canTrashArticle);
  // Batch order is an implementation detail.  Actions must cover every safe
  // item for this client so a newer completed batch cannot hide an older media
  // batch that is still staged locally.
  const cancelableBatches = useMemo(
    () =>
      cancellationPlans
        .map((plan) => ({
          plan,
          batch: submissionBatches.find((batch) => batch.id === plan.batchId),
          count: plan.allowedCount,
        }))
        .filter((entry) => entry.batch && entry.count > 0),
    [cancellationPlans, submissionBatches],
  );
  const cancelableCount = cancelableBatches.reduce(
    (total, entry) => total + entry.count,
    0,
  );
  const cancellationIsPending = cancellationPending?.clientId === clientId;
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

  async function queueSelected() {
    const requestedClientId = clientId;
    if (
      commandBusy(
        "previewRegularQueueAdmission",
        "admitRegularQueueItems",
      )
    )
      return;
    const selectedQueueable = selectedQueueableArticles;
    if (!selectedQueueable.length || !platformId || !accountProfileId) return;
    setError("");
    try {
      if (
        typeof commands.previewRegularQueueAdmission === "function" &&
        typeof commands.admitRegularQueueItems === "function"
      ) {
        const regularInput = {
          articleRefs: selectedQueueable.map((article) => ({
            clientId: requestedClientId,
            articleId: article.id,
          })),
          platformId,
          accountProfileId,
        };
        const preview =
          await commands.previewRegularQueueAdmission(regularInput);
        if (!isCurrentClient(requestedClientId)) return;
        if (!preview.queueableCount && !preview.idempotentCount)
          throw new Error("没有符合普通平台队列规则的文章");
        if (
          !(await confirm({
            title: "确认加入普通平台队列",
            message: `新增 ${preview.queueableCount} 项，已存在跳过 ${preview.idempotentCount} 项，缺失 ${preview.missingCount} 项，冲突 ${preview.conflictCount} 项。`,
            confirmLabel: "确认加入普通平台队列",
          }))
        )
          return;
        const result = await commands.admitRegularQueueItems(regularInput);
        if (
          isContentCommandStaleResult(result) ||
          !isCurrentClient(requestedClientId)
        )
          return;
        updateSelected([]);
        setBatchFeedback({
          kind: "status",
          text: `已加入 ${result.admittedCount || 0} 项普通平台队列。`,
        });
        return;
      }
      throw new Error("请选择一个已配置账号的普通平台");
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(value instanceof Error ? value.message : "批量入队失败");
    }
  }

  async function removePendingSelected() {
    const requestedClientId = clientId;
    if (
      !selectedPendingQueueItems.length ||
      typeof commands.removePendingQueueItems !== "function" ||
      commandBusy("removePendingQueueItems")
    )
      return;
    if (
      !(await confirm({
        title: "确认移除待执行队列项",
        message: `将从普通平台队列移除 ${selectedPendingQueueItems.length} 项尚未开始的投稿；文章随后恢复可编辑。`,
        confirmLabel: "确认移除",
        tone: "warning",
      }))
    )
      return;
    setError("");
    try {
      const result = await commands.removePendingQueueItems({
        items: selectedPendingQueueItems,
      });
      if (
        isContentCommandStaleResult(result) ||
        !isCurrentClient(requestedClientId)
      )
        return;
      updateSelected([]);
      setBatchFeedback({
        kind: result.conflictCount ? "error" : "status",
        text: `已移除 ${result.removedCount || 0} 项普通平台队列；${result.conflictCount || 0} 项需要刷新核对。`,
      });
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(
          value instanceof Error ? value.message : "移除待执行队列项失败",
        );
    }
  }

  async function addPaidStagingSelected() {
    const requestedClientId = clientId;
    const selectedQueueable = selectedQueueableArticles;
    if (!selectedQueueable.length || commandBusy("addPaidSubmissionStaging"))
      return;
    setError("");
    try {
      const result = await commands.addPaidSubmissionStaging({
        articleRefs: selectedQueueable.map((article) => ({
          clientId: requestedClientId,
          articleId: article.id,
        })),
      });
      if (
        isContentCommandStaleResult(result) ||
        !isCurrentClient(requestedClientId)
      )
        return;
      updateSelected([]);
      const addedCount = result?.addedCount || 0;
      const idempotentCount = result?.idempotentCount || 0;
      const details = [
        addedCount ? `已加入 ${addedCount} 篇` : "",
        idempotentCount ? `${idempotentCount} 篇已在队列中` : "",
      ].filter(Boolean);
      setBatchFeedback({
        kind: "status",
        text: `付费媒体投稿队列：${details.join("；") || "已刷新"}。`,
      });
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(value instanceof Error ? value.message : "加入付费媒体投稿队列失败");
    }
  }

  function openArticle(
    article: GeneratedContentArticle,
    source?: HTMLElement | null,
  ) {
    const workflow = workflowForArticle(article);
    if (!workflow) return;
    onArticleSelect(article, source, workflow.stage === "published");
  }

  async function resolveRegularUncertain(
    record: PublicationHistoryRecord,
    status: "published" | "failed",
  ) {
    const requestedClientId = clientId;
    if (record.status !== "uncertain") return;
    if (!record.attemptId) {
      if (isCurrentClient(requestedClientId))
        setError("普通平台投稿尝试缺失，无法核对。");
      return;
    }
    if (!record.targetKey.startsWith("platform:")) {
      if (isCurrentClient(requestedClientId))
        setError("付费订单结果请在订单页使用具名核对动作。");
      return;
    }
    const label = status === "published" ? "确认远端已发布" : "确认远端未发布";
    if (
      !(await confirm({
        title: label,
        message: `${label}会写入发布账本，并影响后续投稿防重。请确认已在远端核对该目标，且不包含正文、密钥或完整响应。`,
        confirmLabel: label,
      }))
    )
      return;
    setError("");
    try {
      const preparation = await commands.prepareRegularUncertainResolution({
        regularPublicationAttemptId: record.attemptId,
      });
      const observedAt = new Date().toISOString();
      const result =
        status === "published"
          ? await commands.confirmRegularAccepted({
              regularPublicationAttemptId:
                preparation.regularPublicationAttemptId,
              confirmationToken: preparation.confirmationToken,
              manualPositiveEvidence: {
                observedAt,
                ...(record.remoteUrl ? { remoteUrl: record.remoteUrl } : {}),
              },
            })
          : await commands.confirmRegularNotAccepted({
              regularPublicationAttemptId:
                preparation.regularPublicationAttemptId,
              confirmationToken: preparation.confirmationToken,
              manualNegativeEvidence: {
                reasonCode: "REGULAR_MANUAL_NOT_ACCEPTED",
                observedAt,
              },
            });
      if (
        isContentCommandStaleResult(result) ||
        !isCurrentClient(requestedClientId)
      )
        return;
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setError(value instanceof Error ? value.message : "核对发布结果失败");
    } finally {
    }
  }

  async function cancelCancelableBatches() {
    const requestedClientId = clientId;
    if (commandBusy("cancelContentSubmissionBatch")) return;
    let requestId = 0;
    const isCurrentCancellationRequest = () =>
      requestId !== 0 &&
      isCurrentClient(requestedClientId) &&
      cancellationRequestIdRef.current === requestId;
    if (!cancelableBatches.length) return;
    setError("");
    try {
      const previews = cancellationPlans.filter(
        (preview) => preview.allowedCount > 0,
      );
      const total = previews.reduce(
        (count, preview) => count + preview.allowedCount,
        0,
      );
      if (!total) {
        if (isCurrentClient(requestedClientId))
          setBatchFeedback({
            kind: "status",
            text: "当前客户全部批次均无可撤销项；已发布文章和发布证据不提供清理动作。",
          });
        return;
      }
      if (!isCurrentClient(requestedClientId)) return;
      if (
        !(await confirm({
          title: "确认撤销未开始投稿",
          message: `将撤销当前客户 ${previews.length} 个批次中的 ${total} 项未开始投稿内容。`,
          confirmLabel: "确认撤销",
          tone: "warning",
        }))
      )
        return;
      requestId = ++cancellationRequestIdRef.current;
      setCancellationPending({ clientId: requestedClientId, count: total });
      setBatchFeedback(null);
      try {
        const results = [];
        for (const preview of previews)
          if (preview.allowedCount) {
            const result = await commands.cancelContentSubmissionBatch({
              batchId: preview.batchId,
              planId: preview.planId,
            });
            if (isContentCommandStaleResult(result)) return;
            results.push(result);
          }
        if (!isCurrentCancellationRequest()) return;
        const cancelledCount = results.reduce(
          (count, result) => count + (result.cancelledCount || 0),
          0,
        );
        const idempotentCount = results.reduce(
          (count, result) => count + (result.idempotentCount || 0),
          0,
        );
        const blockedCount = results.reduce(
          (count, result) => count + (result.blockedItems?.length || 0),
          0,
        );
        const details = [
          `已撤销 ${cancelledCount} 项未开始投稿内容`,
          idempotentCount ? `已确认 ${idempotentCount} 项此前撤销结果` : "",
          blockedCount ? `阻断 ${blockedCount} 项` : "",
        ]
          .filter(Boolean)
          .join("；");
        setBatchFeedback({
          kind:
            blockedCount || (!cancelledCount && blockedCount)
              ? "error"
              : "status",
          text: `${details || "队列已刷新"}。`,
        });
      } catch (value) {
        const code =
          value && typeof value === "object" && "code" in value
            ? String(value.code)
            : "";
        if (code === "SUBMISSION_ACTION_STALE") {
          try {
            if (isCurrentCancellationRequest())
              setBatchFeedback({
                kind: "error",
                text: "队列已变化，请重新检查。",
              });
          } catch (refreshError) {
            if (isCurrentCancellationRequest())
              setBatchFeedback({
                kind: "error",
                text:
                  refreshError instanceof Error
                    ? refreshError.message
                    : "队列已变化，请重新检查。",
              });
          }
        } else if (isCurrentCancellationRequest()) {
          setBatchFeedback({
            kind: "error",
            text: value instanceof Error ? value.message : "撤销投稿批次失败",
          });
        }
      } finally {
        // A late completion from client A must not clear the busy state of a
        // newer request (including one started after switching back to A).
        if (isCurrentCancellationRequest()) {
          setCancellationPending(null);
        }
      }
    } catch (value) {
      if (isCurrentClient(requestedClientId))
        setBatchFeedback({
          kind: "error",
          text: value instanceof Error ? value.message : "读取撤销计划失败",
        });
    }
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

  async function bindPaidOrderNumber(
    item: ArticleAttentionItem,
    orderId: string,
  ) {
    if (!item.orderCreationAttemptId) return;
    setPaidResolutionError("");
    try {
      const prepared = await commands.prepareBindPaidOrderNumber({
        orderCreationAttemptId: item.orderCreationAttemptId,
        orderId,
      });
      if (
        !(await confirm({
          title: "确认补录订单号",
          message: `已核对订单 ${orderId} 的媒体资源、标题和系统投稿标识。确认后将恢复正常订单跟踪。`,
          confirmLabel: "确认补录",
          tone: "warning",
        }))
      )
        return;
      await commands.bindPaidOrderNumber({
        orderCreationAttemptId: item.orderCreationAttemptId,
        orderId,
        confirmationToken: prepared.confirmationToken,
      });
      setAttentionDetail(null);
    } catch (value) {
      setPaidResolutionError(
        value instanceof Error ? value.message : "补录订单号失败。",
      );
    }
  }

  async function confirmPaidOrderAbsent(item: ArticleAttentionItem) {
    if (!item.orderCreationAttemptId) return;
    setPaidResolutionError("");
    try {
      const prepared = await commands.prepareConfirmPaidOrderAbsent({
        orderCreationAttemptId: item.orderCreationAttemptId,
      });
      if (
        !(await confirm({
          title: "确认服务商没有订单",
          message:
            "仅在已人工核对服务商且确认没有生成订单时继续。确认后文章才能解除冻结；迟到的可信订单事实仍会重新冻结并优先保留。",
          confirmLabel: "确认没有订单",
          tone: "danger",
        }))
      )
        return;
      await commands.confirmPaidOrderAbsent({
        orderCreationAttemptId: item.orderCreationAttemptId,
        confirmationToken: prepared.confirmationToken,
      });
      setAttentionDetail(null);
    } catch (value) {
      setPaidResolutionError(
        value instanceof Error ? value.message : "确认没有订单失败。",
      );
    }
  }

  return (
    <div className="relative h-full w-full min-w-0 overflow-y-auto p-4">
      <div className="mb-4 grid min-w-0 gap-3">
        <div className="min-w-0">
          <h2
            aria-label="历史文章"
            className="text-base font-semibold text-slate-800"
          >
            文章管理
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-5 text-slate-500">
            按文章当前阶段组织下一步操作；发布记录和队列状态仍分别保留。
          </p>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)]">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选标题、平台或模板"
            aria-label="筛选历史文章"
            className="h-9 min-w-0 w-full rounded-md border border-slate-300 px-2 text-xs"
          />
        </div>

        {!isAttentionStage && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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
          {selectedPendingQueueItems.length > 0 && (
            <button
              type="button"
              onClick={() => void removePendingSelected()}
              disabled={commandBusy("removePendingQueueItems")}
              className="rounded border border-amber-300 px-3 py-2 text-xs text-amber-700 disabled:opacity-40"
            >
              移除待执行队列 ({selectedPendingQueueItems.length})
            </button>
          )}
          {(cancelableCount > 0 || cancellationIsPending) && (
            <button
              type="button"
              title={
                cancellationIsPending
                  ? "正在撤销当前客户的未开始投稿内容"
                  : `覆盖当前客户全部可撤销批次：${cancelableBatches.map(({ plan, batch, count }) => `${plan.items.find((item) => item.allowed)?.targetPlatformId || "未知目标"} ${formatBeijingTime(batch.createdAt)} (${count})`).join("；")}`
              }
              onClick={() => void cancelCancelableBatches()}
              disabled={
                cancellationIsPending ||
                commandBusy("cancelContentSubmissionBatch")
              }
              className="rounded border border-amber-300 px-3 py-2 text-xs text-amber-700 disabled:opacity-40"
            >
              {cancellationIsPending
                ? `正在撤销… (${cancellationPending.count})`
                : `撤销未开始投稿 (${cancelableCount})`}
            </button>
          )}
          {submissionBatches.length > 0 &&
            !cancelableCount && (
              <span role="status" className="text-xs text-slate-500">
                当前客户全部批次均无可撤销的未开始项。
              </span>
            )}
          </div>
        )}
        {batchFeedback && (
          <div
            role={batchFeedback.kind === "error" ? "alert" : "status"}
            aria-live={batchFeedback.kind === "error" ? "assertive" : "polite"}
            tabIndex={batchFeedback.kind === "error" ? -1 : undefined}
            className={`min-w-0 rounded border p-2 text-xs ${batchFeedback.kind === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}
          >
            {batchFeedback.text}
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
        {removalTransaction && !isAttentionStage && (
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

        {!isAttentionStage && (
          <div className="flex min-w-0 flex-wrap items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-slate-500">
              投稿平台
            </span>
            <select
              aria-label="普通平台投稿目标"
              value={platformId}
              onChange={(event) => {
                setPlatformId(event.target.value);
                setAccountProfileId("");
              }}
              className="h-8 min-w-40 rounded border border-slate-300 px-2 text-xs"
            >
              <option value="">请选择一个平台</option>
              {submissionPlatforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.displayName || platform.id}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void queueSelected()}
            title={
              selectedDirtyArticle
                ? "当前编辑文章有未保存修改，请先保存后投稿。"
                : undefined
            }
            disabled={
              !selectedQueueableArticles.length ||
              !platformId ||
              !accountProfileId ||
              commandBusy(
                "previewRegularQueueAdmission",
                "admitRegularQueueItems",
              )
            }
            className="shrink-0 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            加入投稿队列
          </button>
          <button
            type="button"
            onClick={() => void addPaidStagingSelected()}
            title={
              selectedDirtyArticle
                ? "当前编辑文章有未保存修改，请先保存后投稿。"
                : undefined
            }
            disabled={
              !selectedQueueableArticles.length ||
              commandBusy("addPaidSubmissionStaging")
            }
            className="shrink-0 rounded border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40"
          >
            加入付费媒体投稿队列
          </button>
          <AccountProfileSelector
            platforms={submissionPlatforms}
            platformId={platformId}
            value={accountProfileId}
            onChange={setAccountProfileId}
          />
          </div>
        )}
      </div>
      {visibleError && (
        <div
          role="alert"
          className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700"
        >
          {visibleError}
        </div>
      )}
      {selectedStage === "failed" ? (
        <ArticleAttentionPanel
          snapshot={attentionSnapshot}
          onRefresh={attentionFeature.refresh}
          onPreviewAction={attentionFeature.previewAction}
          onExecutePreview={attentionFeature.executePreview}
          selectedAttentionId={selectedAttentionId}
          getTargetLabel={attentionTargetLabel}
          onOpenPublication={(item) => {
            // Paid-order resolution is a dedicated attention workflow. Open
            // its detail drawer so the typed media commands remain reachable
            // without routing them through the generic attention resolver.
            if (item.resolutionActions?.length) {
              setAttentionDetail(item);
              return;
            }
            const article = articles.find(
              (candidate) => candidate.id === item.articleId,
            );
            if (article) setDrawerArticle(article);
            else setAttentionDetail(item);
          }}
          onInspect={(item) => setAttentionDetail(item)}
          onOpenArticle={(item) => {
            const article = articles.find(
              (candidate) => candidate.id === item.articleId,
            );
            if (article) openArticle(article);
            else setAttentionDetail(item);
          }}
        />
      ) : (
        <GeneratedArticlesList
          groups={groups}
          visibleError={visibleError}
          clientId={clientId}
          collapsed={collapsed}
          selected={selected}
          workflowByArticle={workflowByArticle}
          isArticleSelectable={isArticleSelectable}
          isArticleQueueable={canQueueArticle}
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
      )}
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
                确认后只会撤销尚未开始的 queued 项，并将文章移入回收站；
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
        onReconcile={(record, status) =>
          void resolveRegularUncertain(record, status)
        }
        busy={
          commandStates.prepareRegularUncertainResolution?.busy === true ||
          commandStates.confirmRegularAccepted?.busy === true ||
          commandStates.confirmRegularNotAccepted?.busy === true
        }
      />
      <ArticleAttentionDetailDrawer
        item={attentionDetail}
        onClose={() => setAttentionDetail(null)}
        onBindPaidOrderNumber={bindPaidOrderNumber}
        onConfirmPaidOrderAbsent={confirmPaidOrderAbsent}
        resolutionBusy={
          commandStates.prepareBindPaidOrderNumber?.busy === true ||
          commandStates.bindPaidOrderNumber?.busy === true ||
          commandStates.prepareConfirmPaidOrderAbsent?.busy === true ||
          commandStates.confirmPaidOrderAbsent?.busy === true
        }
        resolutionError={paidResolutionError}
      />
    </div>
  );
}
