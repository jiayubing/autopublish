import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { cancelContentSubmissionBatch, cleanupFailedContentSubmissionItems, copyContentArticleVersion, createContentSubmissionBatch, getArticleManagementSnapshot, getContentArticleRemovalTransaction, onContentArticleRemovalTransaction, permanentlyDeleteContentArticle, preparePermanentDeleteContentArticle, previewCleanupFailedContentSubmissionItems, previewContentArticleRemoval, previewContentSubmissionBatch, restoreContentArticle, retryContentArticleRemovalTransaction, trashContentArticles, type ArticleTrashImpactItem, type ArticleTrashPreview, type ArticleTrashRecord } from '../../bridge/content';
import { reconcilePublicationHistory } from '../../bridge/publication';
import { articleSelectionKey, groupArticlesByTemplate, selectableArticles, selectionState, summarizeTemplateSnapshot } from '../../article-history-logic';
import { ArticleAttentionItem, ArticleAttentionList, ArticleRemovalTransaction, ContentSubmissionBatchRecord, ContentSubmissionCancellationPreview, ContentSubmissionPlatform, GeneratedContentArticle, PublicationHistoryRecord } from '../../types';
import { type ArticleWorkflowStage } from '../../article-workflow';
import { formatBeijingTime } from '../../time-format';
import PublicationHistoryDrawer from './PublicationHistoryDrawer';
import { summarizePublicationRecords } from '../../publication-status';
import ArticleAttentionPanel from './ArticleAttentionPanel';
import ArticleAttentionDetailDrawer from './ArticleAttentionDetailDrawer';
import ActionConfirmationModal, { type ActionConfirmation } from './ActionConfirmationModal';
import { createArticleManagementController } from '../../article-management-controller';

interface GeneratedArticlesViewProps { clientId: string; refreshToken: number; stageFilter?: ArticleWorkflowStage | 'all'; selectedAttentionId?: string; onArticleSelect: (article: GeneratedContentArticle, source?: HTMLElement | null, published?: boolean) => void; onStageFilterChange?: (stage: ArticleWorkflowStage | 'all') => void; }

function selectionKey(article: GeneratedContentArticle) { return articleSelectionKey(article); }

function transactionIdOf(transaction: ArticleRemovalTransaction | null | undefined): string | null {
  const value = transaction?.transactionId || transaction?.id;
  return typeof value === 'string' && value ? value : null;
}

function transactionStatusOf(transaction: Pick<ArticleRemovalTransaction, 'status' | 'phase'> | null | undefined): string {
  if (!transaction) return '';
  if (transaction.status === 'pending_recovery') return transaction.phase === 'needs_repair' ? 'needs_repair' : 'pending_auto_recovery';
  return transaction.status;
}

function isTerminalRemovalTransaction(status: string): boolean {
  return status === 'committed' || status === 'superseded' || status === 'needs_repair';
}

  function transactionReason(transaction: ArticleRemovalTransaction | null): string {
  return transaction?.reasonCode || transaction?.errorCode || '状态冲突';
}

export default function GeneratedArticlesView({ clientId, refreshToken, stageFilter = 'all', selectedAttentionId, onArticleSelect, onStageFilterChange }: GeneratedArticlesViewProps) {
  const [articles, setArticles] = useState<GeneratedContentArticle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [selectedStage, setSelectedStage] = useState<ArticleWorkflowStage | 'all'>(stageFilter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submissionPlatforms, setSubmissionPlatforms] = useState<ContentSubmissionPlatform[]>([]);
  const [targetPlatformIds, setTargetPlatformIds] = useState<string[]>([]);
  const [trash, setTrash] = useState<ArticleTrashRecord[]>([]);
  const [submissionBatches, setSubmissionBatches] = useState<ContentSubmissionBatchRecord[]>([]);
  const [cancellationPlans, setCancellationPlans] = useState<ContentSubmissionCancellationPreview[]>([]);
  const [cancellationPending, setCancellationPending] = useState<{ clientId: string; count: number } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ActionConfirmation | null>(null);
  const confirmationActionRef = useRef<(() => Promise<void>) | null>(null);
  const confirmationIdRef = useRef(0);
  const [publicationRecords, setPublicationRecords] = useState<PublicationHistoryRecord[]>([]);
  const [snapshotWorkflowByArticle, setSnapshotWorkflowByArticle] = useState<Awaited<ReturnType<typeof getArticleManagementSnapshot>>['workflowByArticle']>({});
  const [drawerArticle, setDrawerArticle] = useState<GeneratedContentArticle | null>(null);
  const [attentionDetail, setAttentionDetail] = useState<ArticleAttentionItem | null>(null);
  const [batchFeedback, setBatchFeedback] = useState<{ kind: 'status' | 'error'; text: string } | null>(null);
  const [trashPreview, setTrashPreview] = useState<ArticleTrashPreview | null>(null);
  const [trashFeedback, setTrashFeedback] = useState<{ kind: 'status' | 'error'; text: string } | null>(null);
  const [removalTransaction, setRemovalTransaction] = useState<ArticleRemovalTransaction | null>(null);
  const [removalTransactionId, setRemovalTransactionId] = useState<string | null>(null);
  const [removalWatchVersion, setRemovalWatchVersion] = useState(0);
  const removalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removalUnsubscribeRef = useRef<(() => void) | null>(null);
  const cancellationRequestIdRef = useRef(0);
  const clientIdRef = useRef(clientId);
  const mountedRef = useRef(true);
  const lastNonTrashStageRef = useRef<ArticleWorkflowStage | 'all'>(stageFilter === 'trash' ? 'all' : stageFilter);
  const [attentionSnapshot, setAttentionSnapshot] = useState<ArticleAttentionList & { loading: boolean; error: string | null }>({ revision: 0, items: [], counts: { total: 0, actionable: 0 }, loading: false, error: null });
  const applySnapshotRef = useRef<(snapshot: Awaited<ReturnType<typeof getArticleManagementSnapshot>>) => void>(() => {});
  const resetClientStateRef = useRef<() => void>(() => {});
  const managementControllerRef = useRef(createArticleManagementController({
    loadSnapshot: getArticleManagementSnapshot,
    onSnapshot: (snapshot) => applySnapshotRef.current(snapshot),
    onReset: () => resetClientStateRef.current(),
    onError: (value) => setError(value instanceof Error ? value.message : '无法加载历史文章'),
  }));
  const attentionItems = attentionSnapshot.items;
  clientIdRef.current = clientId;

  function isCurrentClient(requestedClientId: string): boolean {
    return mountedRef.current && clientIdRef.current === requestedClientId;
  }

  const stopRemovalTransactionWatch = useCallback(() => {
    if (removalTimerRef.current) {
      clearTimeout(removalTimerRef.current);
      removalTimerRef.current = null;
    }
    removalUnsubscribeRef.current?.();
    removalUnsubscribeRef.current = null;
  }, []);

  useEffect(() => {
    setSelectedStage(stageFilter);
    if (stageFilter !== 'trash') lastNonTrashStageRef.current = stageFilter;
  }, [stageFilter]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      managementControllerRef.current.dispose();
      stopRemovalTransactionWatch();
    };
  }, [stopRemovalTransactionWatch]);

  const resetClientState = useCallback(() => {
    setRemovalTransaction(null);
    setRemovalTransactionId(null);
    setRemovalWatchVersion(0);
    setSelected([]);
    setError('');
    setBatchFeedback(null);
    setTrashFeedback(null);
    setTrashPreview(null);
    setDrawerArticle(null);
    setAttentionDetail(null);
    setTrash([]);
    setCancellationPlans([]);
    setAttentionSnapshot({ revision: 0, items: [], counts: { total: 0, actionable: 0 }, loading: false, error: null });
    cancellationRequestIdRef.current += 1;
    setCancellationPending(null);
    confirmationActionRef.current = null;
    setPendingConfirmation(null);
    setBusy(false);
    stopRemovalTransactionWatch();
  }, [stopRemovalTransactionWatch]);
  resetClientStateRef.current = resetClientState;

  const applyManagementSnapshot = useCallback((snapshot: Awaited<ReturnType<typeof getArticleManagementSnapshot>>) => {
    setArticles(snapshot.articles || []);
    setSubmissionBatches(snapshot.submissionBatches || []);
    setCancellationPlans(snapshot.cancellationPlans || []);
    setTrash(snapshot.trash || []);
    setPublicationRecords(snapshot.publicationRecords || []);
    setSnapshotWorkflowByArticle(snapshot.workflowByArticle || {});
    setSubmissionPlatforms((snapshot.submissionPlatforms || []).filter((platform) => platform.contentQueueImport));
    setAttentionSnapshot({ ...(snapshot.attention || { revision: snapshot.revision, items: [], counts: { total: 0, actionable: 0 } }), loading: false, error: null });
    return snapshot.articles || [];
  }, []);
  applySnapshotRef.current = applyManagementSnapshot;

  const updateSelected = useCallback((next: React.SetStateAction<string[]>) => {
    setSelected((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      managementControllerRef.current.setSelection(value);
      return value;
    });
  }, []);

  useEffect(() => {
    void managementControllerRef.current.refresh(clientId);
  }, [clientId, refreshToken]);

  const queuedArticleIds = useMemo(() => new Set(submissionBatches.flatMap((batch) => batch.status === 'queued' ? batch.items.filter((item) => item.status === 'queued').map((item) => item.articleId) : [])), [submissionBatches]);
  const publicationRecordsByArticle = useMemo(() => {
    const grouped = new Map<string, PublicationHistoryRecord[]>();
    publicationRecords.forEach((record) => {
      if (!record.articleId) return;
      grouped.set(record.articleId, [...(grouped.get(record.articleId) || []), record]);
    });
    return grouped;
  }, [publicationRecords]);
  const publicationSummaries = useMemo(() => {
    const summaries = new Map<string, ReturnType<typeof summarizePublicationRecords>>();
    articles.forEach((article) => {
      const records = publicationRecordsByArticle.get(article.id) || [];
      summaries.set(article.id, records.length ? summarizePublicationRecords(records) : queuedArticleIds.has(article.id) ? { status: 'queued', label: '已入队', records: 0, published: 0, uncertain: false } : summarizePublicationRecords([]));
    });
    return summaries;
  }, [articles, publicationRecordsByArticle, queuedArticleIds]);
  const workflowByArticle = useMemo(() => new Map(articles.map((article) => [article.id, snapshotWorkflowByArticle[article.id]])), [articles, snapshotWorkflowByArticle]);
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return articles.filter((article) => {
      // Older main-process snapshots did not include workflowByArticle. Treat
      // those articles as pending until a fresh authoritative snapshot arrives.
      const stageMatches = selectedStage === 'all' || (snapshotWorkflowByArticle[article.id]?.stage || 'pending_submission') === selectedStage;
      const textMatches = !query || `${article.title} ${article.content} ${article.platform} ${article.templateId} ${article.templateSnapshot?.name || ''} ${article.templateSnapshot?.scenario || ''} ${article.templateSnapshot?.body || ''}`.toLowerCase().includes(query);
      return stageMatches && textMatches;
    });
  }, [articles, filter, selectedStage, snapshotWorkflowByArticle]);
  const groups = useMemo(() => groupArticlesByTemplate(filtered), [filtered]);
  const operable = useMemo(() => selectableArticles(filtered, clientId), [filtered, clientId]);
  const selectedArticles = filtered.filter((article) => selected.includes(selectionKey(article)));
  // Batch order is an implementation detail.  Actions must cover every safe
  // item for this client so a newer completed batch cannot hide an older media
  // batch that is still staged locally.
  const cancelableBatches = useMemo(() => cancellationPlans.map((plan) => ({
    plan,
    batch: submissionBatches.find((batch) => batch.id === plan.batchId),
    count: plan.allowedCount,
  })).filter((entry) => entry.batch && entry.count > 0), [cancellationPlans, submissionBatches]);
  const cleanableBatches = useMemo(() => submissionBatches.map((batch) => ({
    batch,
    count: batch.items.filter((item) => item.canCleanup === true).length,
  })).filter((entry) => entry.count > 0), [submissionBatches]);
  const cancelableCount = cancelableBatches.reduce((total, entry) => total + entry.count, 0);
  const cancellationIsPending = cancellationPending?.clientId === clientId;
  const cleanableCount = cleanableBatches.reduce((total, entry) => total + entry.count, 0);
  const removalStatus = transactionStatusOf(removalTransaction);
  const removalTransactionOpen = removalStatus === 'pending_auto_recovery' || removalStatus === 'pending_recovery' || removalStatus === 'needs_repair';
  const removalSubmitDisabled = Boolean(removalTransactionId && (!removalTransaction || removalTransactionOpen));

  function impactPlatform(item: ArticleTrashImpactItem): string {
    return item.displayName || item.targetPlatformId || item.platformId || '未知平台';
  }

  function groupImpact(items: ArticleTrashImpactItem[]): Array<[string, number]> {
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(impactPlatform(item), (counts.get(impactPlatform(item)) || 0) + 1));
    return [...counts.entries()];
  }

  function trashPublicationSummary(entry: ArticleTrashRecord): string {
    const summary = entry.publicationSummary;
    if (!summary || typeof summary !== 'object') return '发布详情保留在发布账本中';
    const value = summary as { label?: unknown; status?: unknown; records?: unknown; published?: unknown };
    const label = typeof value.label === 'string' ? value.label : typeof value.status === 'string' ? value.status : '已保留';
    const records = typeof value.records === 'number' ? ` · ${value.records} 条记录` : '';
    const published = typeof value.published === 'number' ? ` · 已发布 ${value.published}` : '';
    return `${label}${records}${published}`;
  }

  const refreshHistoryData = useCallback(async () => {
    const requestedClientId = clientId;
    if (!mountedRef.current || requestedClientId !== clientIdRef.current) return [];
    const snapshot = await managementControllerRef.current.refresh(requestedClientId);
    return snapshot?.articles || [];
  }, [clientId]);

  const refreshAttention = useCallback(async () => {
    await managementControllerRef.current.refresh(clientId);
    return attentionSnapshot;
  }, [attentionSnapshot, clientId]);

  useEffect(() => {
    stopRemovalTransactionWatch();
    if (!removalTransactionId) return;
    let active = true;
    let hasQueryableSnapshot = false;
    const applyTransaction = (next: ArticleRemovalTransaction) => {
      if (!active || !mountedRef.current) return;
      setRemovalTransaction(next);
      const status = transactionStatusOf(next);
      if (isTerminalRemovalTransaction(status)) {
        stopRemovalTransactionWatch();
        if (status === 'committed' || status === 'superseded') void refreshHistoryData().catch((value) => {
          if (active && mountedRef.current) setTrashFeedback({ kind: 'error', text: value instanceof Error ? value.message : '刷新删除事务结果失败' });
        });
      }
    };
    removalUnsubscribeRef.current = onContentArticleRemovalTransaction(removalTransactionId, applyTransaction);
    const poll = async () => {
      try {
        const next = await getContentArticleRemovalTransaction(removalTransactionId);
        if (!active || !mountedRef.current) return;
        if (next) {
          hasQueryableSnapshot = true;
          applyTransaction(next);
          if (isTerminalRemovalTransaction(transactionStatusOf(next))) return;
        }
      } catch (value) {
        if (active && mountedRef.current) setTrashFeedback({ kind: 'error', text: value instanceof Error ? value.message : '读取删除事务状态失败' });
      }
      if (active && mountedRef.current && hasQueryableSnapshot) removalTimerRef.current = setTimeout(() => { void poll(); }, 1000);
    };
    void poll();
    return () => {
      active = false;
      stopRemovalTransactionWatch();
    };
  }, [removalTransactionId, removalWatchVersion, refreshHistoryData, stopRemovalTransactionWatch]);

  function toggleArticle(article: GeneratedContentArticle) {
    if (article.status !== 'generated' && article.status !== 'saved') return;
    const key = selectionKey(article);
    updateSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function toggleGroup(groupArticles: GeneratedContentArticle[]) {
    const ids = selectableArticles(groupArticles, clientId).map(selectionKey);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    updateSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  async function queueSelected() {
    const requestedClientId = clientId;
    const selectedQueueable = filtered.filter((article) => selected.includes(selectionKey(article)) && (article.status === 'generated' || article.status === 'saved'));
    if (!selectedQueueable.length || !targetPlatformIds.length) return;
    setError('');
    try {
      const input = { clientId, articleIds: selectedQueueable.map((article) => article.id), targetPlatformIds };
      const preview = await previewContentSubmissionBatch(input);
      if (!isCurrentClient(requestedClientId)) return;
      if (!preview.queueableTaskCount && !preview.idempotentCount) throw new Error('没有符合投稿就绪规则的文章');
      confirmationActionRef.current = async () => {
        setBusy(true); setError('');
        try {
          await createContentSubmissionBatch({ ...input, confirmed: true });
          if (!isCurrentClient(requestedClientId)) return;
          updateSelected([]);
          await refreshHistoryData();
        } catch (value) { if (isCurrentClient(requestedClientId)) setError(value instanceof Error ? value.message : '批量入队失败'); }
        finally { if (isCurrentClient(requestedClientId)) setBusy(false); }
      };
      setPendingConfirmation({ id: ++confirmationIdRef.current, clientId: requestedClientId, kind: 'queue', title: '确认加入投稿队列', message: `新增 ${preview.queueableTaskCount} 项，已存在跳过 ${preview.idempotentCount} 项，阻断 ${preview.blockedContentCount || 0} 项，冲突 ${preview.conflictCount} 项。`, confirmLabel: '确认加入投稿队列' });
    } catch (value) { if (isCurrentClient(requestedClientId)) setError(value instanceof Error ? value.message : '批量入队失败'); }
  }

  function openArticle(article: GeneratedContentArticle, source: HTMLElement | null, published: boolean) {
    if (source) onArticleSelect(article, source, published);
    else onArticleSelect(article);
  }

  async function copyPublishedVersion() {
    if (!drawerArticle || !publicationRecordsByArticle.get(drawerArticle.id)?.some((record) => record.status === 'published')) return;
    const source = drawerArticle; const requestedClientId = clientId;
    confirmationActionRef.current = async () => { setBusy(true); setError(''); try {
      const nextArticle = await copyContentArticleVersion({ clientId: requestedClientId, sourceArticleId: source.id });
      const refreshedArticles = await refreshHistoryData();
      if (requestedClientId !== clientIdRef.current || !refreshedArticles.some((article) => article.id === nextArticle.id)) return;
      setDrawerArticle(null); onArticleSelect(nextArticle, null, false);
    } catch (value) { if (isCurrentClient(requestedClientId)) setError(value instanceof Error ? value.message : '复制文章新版本失败'); }
    finally { if (isCurrentClient(requestedClientId)) setBusy(false); } };
    setPendingConfirmation({ id: ++confirmationIdRef.current, clientId: requestedClientId, kind: 'copy-version', title: '确认复制文章新版本', message: `确认复制“${source.title}”为新版本？原文章和发布记录不会修改。新版本会生成新的 articleId，必须重新选择目标并投稿。`, confirmLabel: '确认复制' });
  }

  async function reconcilePublication(record: PublicationHistoryRecord, status: 'published' | 'failed') {
    const requestedClientId = clientId;
    if (record.status !== 'uncertain') return;
    const label = status === 'published' ? '确认远端已发布' : '确认远端未发布';
    confirmationActionRef.current = async () => { setBusy(true); setError(''); try {
      await reconcilePublicationHistory({ publicationId: record.publicationId, status, reasonCode: status === 'published' ? 'CONFIRMED_PUBLISHED' : 'CONFIRMED_NOT_PUBLISHED' });
      await refreshHistoryData();
    } catch (value) { if (isCurrentClient(requestedClientId)) setError(value instanceof Error ? value.message : '核对发布结果失败'); }
    finally { if (isCurrentClient(requestedClientId)) setBusy(false); } };
    setPendingConfirmation({ id: ++confirmationIdRef.current, clientId: requestedClientId, kind: 'reconcile-publication', title: label, message: `${label}会写入发布账本，并影响后续投稿防重。请确认已在远端核对该目标，且不包含正文、密钥或完整响应。`, confirmLabel: label });
  }

  async function refreshBatchAffectedArticles() {
    await refreshHistoryData();
  }

  async function cancelCancelableBatches() {
    const requestedClientId = clientId;
    let requestId = 0;
    const isCurrentCancellationRequest = () => requestId !== 0 && isCurrentClient(requestedClientId) && cancellationRequestIdRef.current === requestId;
    if (!cancelableBatches.length) return;
    setError('');
    try {
      const previews = cancellationPlans.filter((preview) => preview.allowedCount > 0);
      const total = previews.reduce((count, preview) => count + preview.allowedCount, 0);
      if (!total) { if (isCurrentClient(requestedClientId)) setBatchFeedback({ kind: 'status', text: '当前客户全部批次均无可撤销项；明确失败项请使用“清理失败队列项”。' }); return; }
      if (!isCurrentClient(requestedClientId)) return;
      confirmationActionRef.current = async () => {
        requestId = ++cancellationRequestIdRef.current;
        setBusy(true); setCancellationPending({ clientId: requestedClientId, count: total });
        setCancellationPlans([]); setBatchFeedback(null);
        try {
          const results = [];
          for (const preview of previews) if (preview.allowedCount) results.push(await cancelContentSubmissionBatch(preview.batchId, preview.planId));
          await refreshBatchAffectedArticles();
          if (!isCurrentCancellationRequest()) return;
        const cancelledCount = results.reduce((count, result) => count + (result.cancelledCount || 0), 0);
        const idempotentCount = results.reduce((count, result) => count + (result.idempotentCount || 0), 0);
        const blockedCount = results.reduce((count, result) => count + (result.blockedItems?.length || 0), 0);
        const details = [
          `已撤销 ${cancelledCount} 项未开始投稿内容`,
          idempotentCount ? `已确认 ${idempotentCount} 项此前撤销结果` : '',
          blockedCount ? `阻断 ${blockedCount} 项` : '',
        ].filter(Boolean).join('；');
          setBatchFeedback({ kind: blockedCount || (!cancelledCount && blockedCount) ? 'error' : 'status', text: `${details || '队列已刷新'}。` });
        } catch (value) {
      const code = value && typeof value === 'object' && 'code' in value ? String(value.code) : '';
      if (code === 'SUBMISSION_ACTION_STALE') {
        try {
          await refreshBatchAffectedArticles();
          if (isCurrentCancellationRequest()) setBatchFeedback({ kind: 'error', text: '队列已变化，请重新检查。' });
        } catch (refreshError) {
          if (isCurrentCancellationRequest()) setBatchFeedback({ kind: 'error', text: refreshError instanceof Error ? refreshError.message : '队列已变化，请重新检查。' });
        }
      } else if (isCurrentCancellationRequest()) {
        setBatchFeedback({ kind: 'error', text: value instanceof Error ? value.message : '撤销投稿批次失败' });
      }
        } finally {
      // A late completion from client A must not clear the busy state of a
      // newer request (including one started after switching back to A).
      if (isCurrentCancellationRequest()) {
        setCancellationPending(null);
        setBusy(false);
      }
        }
      };
      setPendingConfirmation({ id: ++confirmationIdRef.current, clientId: requestedClientId, kind: 'cancel', title: '确认撤销未开始投稿', message: `将撤销当前客户 ${previews.length} 个批次中的 ${total} 项未开始投稿内容。`, confirmLabel: '确认撤销' });
    } catch (value) {
      if (isCurrentClient(requestedClientId)) setBatchFeedback({ kind: 'error', text: value instanceof Error ? value.message : '读取撤销计划失败' });
    }
  }

  async function cleanupFailedBatches() {
    const requestedClientId = clientId;
    if (!cleanableBatches.length) return;
    setBusy(true); setError('');
    try {
      const previews = await Promise.all(cleanableBatches.map(({ batch }) => previewCleanupFailedContentSubmissionItems(batch.id)));
      const total = previews.reduce((count, preview) => count + preview.cleanableCount, 0);
      if (!total) { if (isCurrentClient(requestedClientId)) setBatchFeedback({ kind: 'status', text: '当前客户全部批次均无可清理的明确失败队列项。' }); return; }
      if (!isCurrentClient(requestedClientId)) return;
      confirmationActionRef.current = async () => { setBusy(true); try {
        const results = []; for (const preview of previews) if (preview.cleanableCount) results.push(await cleanupFailedContentSubmissionItems(preview.batchId));
        await refreshBatchAffectedArticles();
        if (isCurrentClient(requestedClientId)) setBatchFeedback({ kind: 'status', text: `已清理 ${results.reduce((count, result) => count + (result.cleanedCount || 0), 0)} 项失败队列副本；发布失败记录仍保留。` });
      } catch (value) { if (isCurrentClient(requestedClientId)) setBatchFeedback({ kind: 'error', text: value instanceof Error ? value.message : '清理失败队列项失败' }); }
      finally { if (isCurrentClient(requestedClientId)) setBusy(false); } };
      setBusy(false);
      setPendingConfirmation({ id: ++confirmationIdRef.current, clientId: requestedClientId, kind: 'cleanup-failed', title: '确认清理失败队列项', message: `确认清理当前客户 ${previews.length} 个批次中的 ${total} 项明确失败队列副本？发布失败记录会保留。`, confirmLabel: '确认清理' });
      return;
    } catch (value) { if (isCurrentClient(requestedClientId)) setBatchFeedback({ kind: 'error', text: value instanceof Error ? value.message : '清理失败队列项失败' }); }
    finally { if (isCurrentClient(requestedClientId)) setBusy(false); }
  }

  async function previewTrashSelections(selections: Array<{ clientId: string; articleId: string }>) {
    if (!selections.length) return;
    const requestedClientId = clientId;
    setBusy(true); setError(''); setTrashFeedback(null);
    try {
      const preview = await previewContentArticleRemoval(selections);
      if (!isCurrentClient(requestedClientId)) return;
      const existingTransaction = preview.openTransaction || preview.transaction || null;
      const existingTransactionId = preview.openTransactionId || preview.transactionId || transactionIdOf(existingTransaction);
      if (existingTransaction) setRemovalTransaction(existingTransaction);
      if (existingTransactionId) setRemovalTransactionId(existingTransactionId);
      if (existingTransactionId) setTrashFeedback({ kind: 'status', text: '已存在相同删除事务，正在复用并读取其状态；不会重复创建。' });
      setTrashPreview(preview);
    } catch (value) { if (isCurrentClient(requestedClientId)) setError(value instanceof Error ? value.message : '回收站预检失败'); }
    finally { if (isCurrentClient(requestedClientId)) setBusy(false); }
  }

  async function trashSelected() {
    await previewTrashSelections(selectedArticles.map((article) => ({ clientId: article.clientId, articleId: article.id })));
  }

  async function trashPublishedArticle(article: GeneratedContentArticle) {
    await previewTrashSelections([{ clientId: article.clientId, articleId: article.id }]);
  }

  async function commitTrash() {
    if (!trashPreview || !trashPreview.canCommit || removalSubmitDisabled) return;
    const requestedClientId = clientId;
    setBusy(true); setError('');
    try {
      const selections = trashPreview.selections || selectedArticles.map((article) => ({ clientId: article.clientId, articleId: article.id }));
      const result = await trashContentArticles({ articles: selections, selections, token: trashPreview.token, legacy: trashPreview.legacy, confirmed: true });
      if (!isCurrentClient(requestedClientId)) return;
      const resultTransaction = result.transaction || (result.transactionId ? {
        transactionId: result.transactionId,
        status: result.status || 'committed',
        phase: result.phase,
        errorCode: result.errorCode,
        reasonCode: result.reasonCode,
        articleCount: result.articleCount
      } : null);
      const resultStatus = transactionStatusOf(resultTransaction);
      if (resultTransaction) setRemovalTransaction(resultTransaction);
      const resultTransactionId = result.transactionId || transactionIdOf(resultTransaction);
      if (resultTransactionId) setRemovalTransactionId(resultTransactionId);
      setTrashPreview(null);
      updateSelected([]);
      await refreshHistoryData();
      if (resultStatus === 'pending_auto_recovery' || resultStatus === 'pending_recovery') {
        setTrashFeedback({ kind: 'status', text: `已确认移入回收站 ${result.articleCount || selections.length} 篇，删除事务正在自动恢复${resultTransaction?.updatedAt ? `（最近更新：${formatBeijingTime(resultTransaction.updatedAt)})` : ''}。` });
      } else if (resultStatus === 'needs_repair') {
        setTrashFeedback({ kind: 'error', text: `删除事务需要修复：${transactionReason(resultTransaction)}` });
      } else {
        setTrashFeedback({ kind: 'status', text: `已将 ${result.articleCount || selections.length} 篇文章移入回收站；发布记录继续保留，恢复文章不会重新加入投稿队列。` });
      }
    } catch (value) {
      if (isCurrentClient(requestedClientId)) setTrashFeedback({ kind: 'error', text: value instanceof Error ? value.message : '移入回收站失败；未完成的事务可稍后恢复' });
    } finally { if (isCurrentClient(requestedClientId)) setBusy(false); }
  }

  async function retryRemovalTransaction() {
    if (!removalTransactionId) return;
    const requestedClientId = clientId;
    setBusy(true);
    setTrashFeedback(null);
    try {
      const next = await retryContentArticleRemovalTransaction(removalTransactionId);
      if (!isCurrentClient(requestedClientId)) return;
      setRemovalTransaction(next);
      setRemovalWatchVersion((current) => current + 1);
      const status = transactionStatusOf(next);
      setTrashFeedback(status === 'needs_repair'
        ? { kind: 'error', text: `删除事务需要修复：${transactionReason(next)}` }
        : { kind: 'status', text: '已提交删除事务修复，正在读取最新状态。' });
    } catch (value) {
      if (isCurrentClient(requestedClientId)) setTrashFeedback({ kind: 'error', text: value instanceof Error ? value.message : '删除事务修复失败' });
    } finally {
      if (isCurrentClient(requestedClientId)) setBusy(false);
    }
  }

  async function restoreOne(entry: ArticleTrashRecord) {
    const requestedClientId = clientId;
    confirmationActionRef.current = async () => { setBusy(true); setError(''); try {
      await restoreContentArticle({ clientId: entry.clientId, articleId: entry.articleId });
      await refreshHistoryData();
    } catch (value) { if (isCurrentClient(requestedClientId)) setError(value instanceof Error ? value.message : '恢复文章失败'); }
    finally { if (isCurrentClient(requestedClientId)) setBusy(false); } };
    setPendingConfirmation({ id: ++confirmationIdRef.current, clientId: requestedClientId, kind: 'restore-article', title: '确认恢复文章', message: `确认恢复“${entry.titleSnapshot || entry.articleId}”？恢复文章不会重新加入投稿队列。`, confirmLabel: '确认恢复' });
  }

  async function permanentlyDeleteOne(entry: ArticleTrashRecord) {
    const confirmation = await preparePermanentDeleteContentArticle({ clientId: entry.clientId, articleId: entry.articleId });
    const requestedClientId = clientId;
    if (!isCurrentClient(requestedClientId)) return;
    confirmationActionRef.current = async () => { setBusy(true); setError(''); try {
      await permanentlyDeleteContentArticle({ clientId: entry.clientId, articleId: entry.articleId, token: confirmation.token });
      await refreshHistoryData();
    } catch (value) { if (isCurrentClient(requestedClientId)) setError(value instanceof Error ? value.message : '永久删除文章失败'); }
    finally { if (isCurrentClient(requestedClientId)) setBusy(false); } };
    setPendingConfirmation({ id: ++confirmationIdRef.current, clientId: requestedClientId, kind: 'permanent-delete', title: '确认永久删除文章', message: `永久删除“${entry.articleId}”？正文和 Markdown 将不可恢复。`, confirmLabel: '永久删除' });
  }

  function toggleAll() {
    const ids = operable.map(selectionKey);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    updateSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  if (selectedStage === 'trash') return <div className="relative h-full w-full min-w-0 overflow-y-auto p-4">
    <div className="mb-4 flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-slate-800">文章回收站</h2><p className="mt-1 text-xs text-slate-500">回收站只保留标题快照、删除时间和发布记录摘要；正文恢复不会自动恢复投稿队列。</p></div><button type="button" onClick={() => { const next = lastNonTrashStageRef.current; setSelectedStage(next); onStageFilterChange?.(next); }} className="rounded border border-slate-300 px-3 py-2 text-xs">返回文章管理</button></div>
    {error && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="grid gap-3">{trash.map((entry) => <div key={entry.articleId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3"><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold text-slate-800">{entry.titleSnapshot || `已删除文章 · ${entry.articleId.slice(-6)}`}</div><div className="mt-1 break-all text-xs text-slate-500">文章 ID：{entry.articleId} · {entry.status} · 删除于 {formatBeijingTime(entry.deletedAt)}</div><div className="mt-1 text-xs text-slate-600">只读发布详情：{trashPublicationSummary(entry)}</div>{entry.references?.length > 0 && <div className="mt-1 text-xs text-slate-400">关联记录：{entry.references.map((reference) => `${reference.type}/${reference.id}`).join('、')}</div>}</div><button type="button" disabled={busy} onClick={() => void restoreOne(entry)} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">恢复（不恢复队列）</button><button type="button" disabled={busy} onClick={() => void permanentlyDeleteOne(entry)} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">永久删除正文</button></div>)}{!trash.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">回收站为空</div>}</div>
    <ActionConfirmationModal pending={pendingConfirmation} submitting={busy} onCancel={() => { confirmationActionRef.current = null; setPendingConfirmation(null); }} onConfirm={() => { const action = confirmationActionRef.current; confirmationActionRef.current = null; setPendingConfirmation(null); if (action) void action(); }} />
  </div>;

  return <div className="relative h-full w-full min-w-0 overflow-y-auto p-4">
    <div className="mb-4 grid min-w-0 gap-3">
      <div className="min-w-0">
        <h2 aria-label="历史文章" className="text-base font-semibold text-slate-800">文章管理</h2>
        <p className="mt-1 max-w-prose text-xs leading-5 text-slate-500">按文章当前阶段组织下一步操作；发布记录和队列状态仍分别保留。</p>
      </div>


      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)]">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选标题、平台或模板" aria-label="筛选历史文章" className="h-9 min-w-0 w-full rounded-md border border-slate-300 px-2 text-xs" />
      </div>

       <div className="flex min-w-0 flex-wrap items-center gap-2">
         <button type="button" onClick={toggleAll} disabled={!operable.length || busy} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">全选当前结果</button>
         <button type="button" onClick={() => void trashSelected()} disabled={!selectedArticles.length || busy || removalSubmitDisabled} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">移入回收站 ({selectedArticles.length})</button>
         {(cancelableCount > 0 || cancellationIsPending) && <button type="button" title={cancellationIsPending ? '正在撤销当前客户的未开始投稿内容' : `覆盖当前客户全部可撤销批次：${cancelableBatches.map(({ plan, batch, count }) => `${plan.items.find((item) => item.allowed)?.targetPlatformId || '未知目标'} ${formatBeijingTime(batch.createdAt)} (${count})`).join('；')}`} onClick={() => void cancelCancelableBatches()} disabled={busy} className="rounded border border-amber-300 px-3 py-2 text-xs text-amber-700 disabled:opacity-40">{cancellationIsPending ? `正在撤销… (${cancellationPending.count})` : `撤销未开始投稿 (${cancelableCount})`}</button>}
         {cleanableCount > 0 && <button type="button" onClick={() => void cleanupFailedBatches()} disabled={busy} className="rounded border border-orange-300 px-3 py-2 text-xs text-orange-700 disabled:opacity-40">清理失败队列项 ({cleanableCount})</button>}
         {submissionBatches.length > 0 && !cancelableCount && !cleanableCount && <span role="status" className="text-xs text-slate-500">当前客户全部批次均无可撤销或可清理项。</span>}
       </div>
         {batchFeedback && <div role={batchFeedback.kind === 'error' ? 'alert' : 'status'} aria-live={batchFeedback.kind === 'error' ? 'assertive' : 'polite'} tabIndex={batchFeedback.kind === 'error' ? -1 : undefined} className={`min-w-0 rounded border p-2 text-xs ${batchFeedback.kind === 'error' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{batchFeedback.text}</div>}
         {trashFeedback && <div role={trashFeedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`min-w-0 rounded border p-2 text-xs ${trashFeedback.kind === 'error' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{trashFeedback.text}</div>}
         {removalTransaction && <div role={removalStatus === 'needs_repair' ? 'alert' : 'status'} aria-live={removalStatus === 'needs_repair' ? 'assertive' : 'polite'} className={`min-w-0 rounded border p-2 text-xs ${removalStatus === 'needs_repair' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>
           {removalStatus === 'pending_auto_recovery' || removalStatus === 'pending_recovery' ? `删除事务正在自动恢复${removalTransaction.updatedAt ? ` · 最近更新：${formatBeijingTime(removalTransaction.updatedAt)}` : ''}` : removalStatus === 'needs_repair' ? <><span>删除事务需要修复：{transactionReason(removalTransaction)}</span><button type="button" onClick={() => void retryRemovalTransaction()} disabled={busy} className="ml-2 rounded border border-rose-300 px-2 py-1 text-xs disabled:opacity-40">重试修复删除事务</button></> : removalStatus === 'superseded' ? '删除事务已由现有事务复用并归档。' : '删除事务已完成。'}
         </div>}

       <div className="flex min-w-0 flex-wrap items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-slate-500">投稿平台</span>
          {submissionPlatforms.map((platform) => <button key={platform.id} type="button" onClick={() => setTargetPlatformIds((current) => current.includes(platform.id) ? current.filter((id) => id !== platform.id) : [...current, platform.id])} className={`rounded border px-2 py-1 text-xs ${targetPlatformIds.includes(platform.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600'}`}>{platform.displayName || platform.id}</button>)}
        </div>
         <button type="button" onClick={() => void queueSelected()} disabled={!selectedArticles.some((article) => article.status === 'generated' || article.status === 'saved') || !targetPlatformIds.length || busy} className="shrink-0 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">加入投稿队列</button>
      </div>
    </div>
     {error && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
     {selectedStage === 'failed' && <div className="mb-3"><ArticleAttentionPanel snapshot={attentionSnapshot} onRefresh={refreshAttention} selectedAttentionId={selectedAttentionId} onOpenPublication={(item) => { const article = articles.find((candidate) => candidate.id === item.articleId); if (article) setDrawerArticle(article); else setAttentionDetail(item); }} onInspect={(item) => setAttentionDetail(item)} onOpenArticle={(item) => { const article = articles.find((candidate) => candidate.id === item.articleId); if (article) onArticleSelect(article, null, false); else setAttentionDetail(item); }} /></div>}
    <div className="grid gap-3">
      {groups.map((group) => {
        const groupSelectable = selectableArticles(group.articles, clientId);
        const groupSelection = selectionState(group.articles, selected, clientId);
        const isCollapsed = collapsed[group.key] !== false;
        const templateSnapshot = group.templateSnapshot;
        const snapshotBody = summarizeTemplateSnapshot(templateSnapshot);
        return <section key={group.key} className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            <input type="checkbox" aria-label={`全选 ${group.label}`} checked={groupSelection.checked} ref={(element) => { if (element) element.indeterminate = groupSelection.indeterminate; }} onChange={() => toggleGroup(group.articles)} disabled={groupSelection.disabled || busy} />
            <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !isCollapsed }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
             <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{group.platform} · {group.label}</span><span className="mt-1 block text-xs text-slate-500">{group.articles.length} 篇 · 待投稿 {groupSelectable.length} · 最新 {formatBeijingTime(group.articles[0]?.createdAt)}</span>{templateSnapshot && <span className="mt-1 block truncate text-xs text-slate-400">场景：{templateSnapshot.scenario} · 正文解释：{snapshotBody}</span>}</span>
            </button>
          </div>
          {!isCollapsed && <div className="min-w-0 divide-y divide-slate-100">{group.articles.map((article) => <div key={article.id} className="flex min-w-0 flex-wrap items-start gap-3 p-3">
             <input type="checkbox" aria-label={`选择 ${article.title}`} checked={selected.includes(selectionKey(article))} onChange={() => toggleArticle(article)} disabled={(article.status !== 'generated' && article.status !== 'saved') || busy} className="mt-1" />
             <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <button type="button" onClick={(event) => openArticle(article, event.currentTarget, publicationRecordsByArticle.get(article.id)?.some((record) => record.status === 'published') === true)} className="min-w-0 flex-[1_1_16rem] text-left hover:text-blue-700"><span className="block break-words text-sm font-semibold text-slate-800 sm:truncate">{article.title}</span><span className="mt-1 block break-words text-xs text-slate-500">状态：{article.status}{queuedArticleIds.has(article.id) ? ' · 已入队' : ''} · 版本：{article.version || 1} · {formatBeijingTime(article.createdAt)} · 发布：{publicationSummaries.get(article.id)?.label || '未投稿'}</span></button>
              <button type="button" onClick={() => setDrawerArticle(article)} className={`shrink-0 rounded border px-2 py-2 text-xs ${workflowByArticle.get(article.id)?.stage === 'failed' ? 'border-amber-300 text-amber-700 hover:border-amber-400' : 'border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700'}`}>{workflowByArticle.get(article.id)?.stage === 'failed' ? '打开需处理' : '发布详情'}</button>
              {workflowByArticle.get(article.id)?.stage === 'published' && <button type="button" onClick={() => void trashPublishedArticle(article)} disabled={busy || removalSubmitDisabled} className="shrink-0 rounded border border-rose-300 px-2 py-2 text-xs text-rose-700 disabled:opacity-40">移入回收站</button>}
           </div>)}</div>}
        </section>;
      })}
      {!groups.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">暂无历史文章</div>}
    </div>
    {trashPreview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="移入回收站预检"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-slate-800">移入回收站预检</h3><p className="mt-1 text-xs leading-5 text-slate-500">远端已发布内容不会撤回；发布记录和标题快照会保留。本地文章正文和投稿队列副本会进入回收站/被清理，恢复文章不会自动恢复投稿队列。</p></div><button type="button" onClick={() => setTrashPreview(null)} disabled={busy} aria-label="关闭回收站预检" className="rounded p-1 text-slate-400 hover:bg-slate-100">×</button></div><div className="mt-4 grid gap-2 text-sm text-slate-700"><div>文章数：<strong>{trashPreview.articleCount}</strong></div><div>已发布本地副本：{groupImpact(trashPreview.publishedToClean || []).map(([platform, count]) => <span key={platform} className="ml-2 inline-flex rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{platform} {count}</span>)}{!(trashPreview.publishedToClean || []).length && <span className="ml-2 text-xs text-slate-400">无</span>}</div><div>失败本地副本：{groupImpact(trashPreview.failedToClean).map(([platform, count]) => <span key={platform} className="ml-2 inline-flex rounded bg-orange-50 px-2 py-1 text-xs text-orange-800">{platform} {count}</span>)}{!trashPreview.failedToClean.length && <span className="ml-2 text-xs text-slate-400">无</span>}</div><div>仍在投稿/待确认：{trashPreview.blockedItems.length}</div><div>发布记录：保留</div></div>{(trashPreview.openTransaction || trashPreview.transaction) && <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">已存在相同删除事务，已复用现有事务；请查看上方状态，不会重复创建。</div>}{trashPreview.blockedItems.length > 0 && <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3"><div className="text-sm font-semibold text-rose-800">阻止项（整批不可提交）</div><ul className="mt-2 grid gap-1 text-xs text-rose-700">{trashPreview.blockedItems.map((item, index) => <li key={`${item.articleId || 'article'}-${index}`}>{item.articleId || '文章'} · {impactPlatform(item)} · {item.reasonCode || item.status || '状态冲突'}</li>)}</ul><p className="mt-2 text-xs text-rose-700">请取消选择风险文章后重新预检。</p></div>}{trashPreview.canCommit && !removalSubmitDisabled && <div className="mt-4 rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">确认后会撤销可撤销的 queued、清理终结的 failed/published/cancelled 本地副本，并将文章移入回收站；远端已发布内容不会撤回。</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTrashPreview(null)} disabled={busy} className="rounded border border-slate-300 px-3 py-2 text-xs">取消</button><button type="button" onClick={() => void commitTrash()} disabled={!trashPreview.canCommit || busy || removalSubmitDisabled} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{removalSubmitDisabled ? '已有开放删除事务' : '确认移入回收站'}</button></div></div></div>}
    <ActionConfirmationModal pending={pendingConfirmation} submitting={busy} onCancel={() => { confirmationActionRef.current = null; setPendingConfirmation(null); }} onConfirm={() => { const action = confirmationActionRef.current; confirmationActionRef.current = null; setPendingConfirmation(null); if (action) void action(); }} />
    <PublicationHistoryDrawer article={drawerArticle} records={drawerArticle ? (publicationRecordsByArticle.get(drawerArticle.id) || []) : []} onClose={() => setDrawerArticle(null)} onCopyVersion={() => void copyPublishedVersion()} onReconcile={(record, status) => void reconcilePublication(record, status)} busy={busy} />
    <ArticleAttentionDetailDrawer item={attentionDetail} onClose={() => setAttentionDetail(null)} />
  </div>;
}
