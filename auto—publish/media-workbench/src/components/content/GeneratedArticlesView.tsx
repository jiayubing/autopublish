import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { cancelContentSubmissionBatch, cleanupFailedContentSubmissionItems, copyContentArticleVersion, createContentSubmissionBatch, listContentArticles, listContentSubmissionBatches, listContentSubmissionPlatforms, listPublicationHistory, listContentTrash, permanentlyDeleteContentArticle, preparePermanentDeleteContentArticle, previewCancelContentSubmissionBatch, previewCleanupFailedContentSubmissionItems, previewContentArticleRemoval, previewContentSubmissionBatch, reconcilePublicationHistory, restoreContentArticle, reviewContentArticles, trashContentArticles, type ArticleTrashImpactItem, type ArticleTrashPreview, type ArticleTrashRecord } from '../../electron-api';
import { articleSelectionKey, groupArticlesByTemplate, selectableArticles, selectionState, summarizeTemplateSnapshot } from '../../article-history-logic';
import { ContentSubmissionPlatform, GeneratedContentArticle, PublicationHistoryRecord } from '../../types';
import { formatBeijingTime } from '../../time-format';
import PublicationHistoryDrawer from './PublicationHistoryDrawer';
import { PUBLICATION_STATUS_FILTERS, publicationSummaryMatchesFilter, summarizePublicationRecords, type PublicationHistoryFilter } from '../../publication-status';

interface GeneratedArticlesViewProps { clientId: string; refreshToken: number; onArticleSelect: (article: GeneratedContentArticle, source?: HTMLElement | null, published?: boolean) => void; onRefreshArticles?: () => void; }

function selectionKey(article: GeneratedContentArticle) { return articleSelectionKey(article); }

export default function GeneratedArticlesView({ clientId, refreshToken, onArticleSelect, onRefreshArticles }: GeneratedArticlesViewProps) {
  const [articles, setArticles] = useState<GeneratedContentArticle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [publicationFilter, setPublicationFilter] = useState<PublicationHistoryFilter>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submissionPlatforms, setSubmissionPlatforms] = useState<ContentSubmissionPlatform[]>([]);
  const [targetPlatformIds, setTargetPlatformIds] = useState<string[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trash, setTrash] = useState<ArticleTrashRecord[]>([]);
  const [submissionBatches, setSubmissionBatches] = useState<Array<{ id: string; status: string; items: Array<{ articleId: string; status: string }> }>>([]);
  const [publicationRecords, setPublicationRecords] = useState<PublicationHistoryRecord[]>([]);
  const [drawerArticle, setDrawerArticle] = useState<GeneratedContentArticle | null>(null);
  const [batchFeedback, setBatchFeedback] = useState<{ kind: 'status' | 'error'; text: string } | null>(null);
  const [trashPreview, setTrashPreview] = useState<ArticleTrashPreview | null>(null);
  const [trashFeedback, setTrashFeedback] = useState<{ kind: 'status' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) { setArticles([]); setSelected([]); setSubmissionBatches([]); setPublicationRecords([]); return () => { cancelled = true; }; }
    listContentArticles(clientId).then((items) => {
      if (cancelled) return;
      setArticles(items);
      return listPublicationHistory(clientId, items.map((item) => item.id)).then((records) => { if (!cancelled) setPublicationRecords(records); });
    }).catch((value) => { if (!cancelled) setError(value instanceof Error ? value.message : '无法加载历史文章'); });
    listContentSubmissionBatches(clientId).then((items) => { if (!cancelled) setSubmissionBatches(items); }).catch(() => { if (!cancelled) setSubmissionBatches([]); });
    return () => { cancelled = true; };
  }, [clientId, refreshToken]);

  useEffect(() => {
    listContentSubmissionPlatforms().then((platforms) => setSubmissionPlatforms(platforms.filter((platform) => platform.contentQueueImport))).catch(() => setSubmissionPlatforms([]));
  }, []);

  useEffect(() => {
    if (!clientId || !showTrash) return;
    listContentTrash(clientId).then(setTrash).catch((value) => setError(value instanceof Error ? value.message : '无法加载回收站'));
  }, [clientId, refreshToken, showTrash]);

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
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return articles.filter((article) => {
      const statusMatches = statusFilter === 'all' || (statusFilter === 'queued' ? queuedArticleIds.has(article.id) : article.status === statusFilter);
      const publicationMatches = publicationSummaryMatchesFilter(publicationSummaries.get(article.id) || summarizePublicationRecords([]), publicationFilter);
      const textMatches = !query || `${article.title} ${article.content} ${article.platform} ${article.templateId} ${article.templateSnapshot?.name || ''} ${article.templateSnapshot?.scenario || ''} ${article.templateSnapshot?.body || ''}`.toLowerCase().includes(query);
      return statusMatches && publicationMatches && textMatches;
    });
  }, [articles, filter, statusFilter, publicationFilter, publicationSummaries, queuedArticleIds]);
  const groups = useMemo(() => groupArticlesByTemplate(filtered), [filtered]);
  const operable = useMemo(() => selectableArticles(filtered, clientId), [filtered, clientId]);
  const reviewable = operable.filter((article) => article.status === 'generated');
  const selectedReviewable = reviewable.filter((article) => selected.includes(selectionKey(article)));
  const selectedArticles = filtered.filter((article) => selected.includes(selectionKey(article)));
  const latestBatch = submissionBatches[0];
  const latestBatchCancelableCount = latestBatch?.items.filter((item) => item.status === 'queued' && item.canCancel === true).length || 0;
  const latestBatchCleanupCount = latestBatch?.items.filter((item) => item.status === 'failed' && item.canCleanup === true).length || 0;

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

  async function refreshHistoryData() {
    const [nextArticles, nextBatches] = await Promise.all([
      listContentArticles(clientId),
      listContentSubmissionBatches(clientId)
    ]);
    const nextRecords = await listPublicationHistory(clientId, nextArticles.map((item) => item.id));
    setArticles(nextArticles);
    setSubmissionBatches(nextBatches);
    setPublicationRecords(nextRecords);
    onRefreshArticles?.();
    return nextArticles;
  }

  function toggleArticle(article: GeneratedContentArticle) {
    if (article.status !== 'generated' && article.status !== 'saved') return;
    const key = selectionKey(article);
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function toggleGroup(groupArticles: GeneratedContentArticle[]) {
    const ids = selectableArticles(groupArticles, clientId).map(selectionKey);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  async function reviewSelected() {
    if (!selectedReviewable.length || !window.confirm(`确认审核 ${selectedReviewable.length} 篇文章？审核不会自动投稿。`)) return;
    setBusy(true); setError('');
    try {
      const result = await reviewContentArticles(selectedReviewable.map((article) => ({ clientId: article.clientId, articleId: article.id })));
      if (result.rejected.length) setError(`有 ${result.rejected.length} 篇文章未通过审核：${result.rejected.map((item) => item.code).join(', ')}`);
      setSelected([]);
      setArticles(await listContentArticles(clientId));
      onRefreshArticles?.();
    } catch (value) { setError(value instanceof Error ? value.message : '审核文章失败'); }
    finally { setBusy(false); }
  }

  async function queueSelected() {
    const selectedSaved = filtered.filter((article) => selected.includes(selectionKey(article)) && article.status === 'saved');
    if (!selectedSaved.length || !targetPlatformIds.length) return;
    setBusy(true); setError('');
    try {
      const input = { clientId, articleIds: selectedSaved.map((article) => article.id), targetPlatformIds };
      const preview = await previewContentSubmissionBatch(input);
      if (!preview.queueableTaskCount && !preview.idempotentCount) throw new Error('没有可入队的已审核文章');
      if (!window.confirm(`新增 ${preview.queueableTaskCount} 项，已存在跳过 ${preview.idempotentCount} 项，冲突 ${preview.conflictCount} 项。确认继续？`)) return;
      await createContentSubmissionBatch({ ...input, confirmed: true });
      setSelected([]); setArticles(await listContentArticles(clientId)); setSubmissionBatches(await listContentSubmissionBatches(clientId)); onRefreshArticles?.();
    } catch (value) { setError(value instanceof Error ? value.message : '批量入队失败'); }
    finally { setBusy(false); }
  }

  function openArticle(article: GeneratedContentArticle, source: HTMLElement | null, published: boolean) {
    if (source) onArticleSelect(article, source, published);
    else onArticleSelect(article);
  }

  async function copyPublishedVersion() {
    if (!drawerArticle || !publicationRecordsByArticle.get(drawerArticle.id)?.some((record) => record.status === 'published')) return;
    if (!window.confirm(`确认复制“${drawerArticle.title}”为新版本？原文章和发布记录不会修改。`)) return;
    if (!window.confirm('再次确认：新版本会生成新的 articleId，必须重新审核和投稿。')) return;
    setBusy(true); setError('');
    try {
      const nextArticle = await copyContentArticleVersion({ clientId, sourceArticleId: drawerArticle.id });
      setDrawerArticle(null);
      setArticles(await listContentArticles(clientId));
       onArticleSelect(nextArticle, null, false);
      onRefreshArticles?.();
    } catch (value) { setError(value instanceof Error ? value.message : '复制文章新版本失败'); }
    finally { setBusy(false); }
  }

  async function reconcilePublication(record: PublicationHistoryRecord, status: 'published' | 'failed') {
    if (record.status !== 'uncertain') return;
    const label = status === 'published' ? '确认远端已发布' : '确认远端未发布';
    if (!window.confirm(`${label}？这会写入发布账本，并影响后续投稿防重。`)) return;
    if (!window.confirm('请再次确认：已在远端核对过该目标，且不包含正文、密钥或完整响应。')) return;
    setBusy(true); setError('');
    try {
      await reconcilePublicationHistory({ publicationId: record.publicationId, status, reasonCode: status === 'published' ? 'CONFIRMED_PUBLISHED' : 'CONFIRMED_NOT_PUBLISHED' });
      setPublicationRecords(await listPublicationHistory(clientId, articles.map((item) => item.id)));
    } catch (value) { setError(value instanceof Error ? value.message : '核对发布结果失败'); }
    finally { setBusy(false); }
  }

  async function refreshBatchAffectedArticles() {
    await refreshHistoryData();
  }

  async function cancelLatestBatch() {
    if (!latestBatch) return;
    setBusy(true); setError('');
    try {
      const preview = await previewCancelContentSubmissionBatch(latestBatch.id);
      if (!preview.cancelableCount) {
        setBatchFeedback({ kind: 'status', text: `最近批次没有可撤销项；不可处理 ${preview.uncancelableCount} 项。明确失败项请使用“清理失败队列项”。` });
        return;
      }
      setBatchFeedback({ kind: 'status', text: `撤销预检：可处理 ${preview.cancelableCount} 项，不可处理 ${preview.uncancelableCount} 项。` });
      if (!window.confirm(`确认撤销最近投稿批次的 ${preview.cancelableCount} 项内容？`)) return;
      await cancelContentSubmissionBatch(latestBatch.id);
      await refreshBatchAffectedArticles();
      setBatchFeedback({ kind: 'status', text: `已撤销 ${preview.cancelableCount} 项未开始投稿内容。` });
    } catch (value) { setBatchFeedback({ kind: 'error', text: value instanceof Error ? value.message : '撤销投稿批次失败' }); }
    finally { setBusy(false); }
  }

  async function cleanupLatestBatch() {
    if (!latestBatch) return;
    setBusy(true); setError('');
    try {
      const preview = await previewCleanupFailedContentSubmissionItems(latestBatch.id);
      if (!preview.cleanableCount) {
        setBatchFeedback({ kind: 'status', text: `最近批次没有可清理的明确失败队列项；不可处理 ${preview.uncleanableCount} 项。` });
        return;
      }
      setBatchFeedback({ kind: 'status', text: `清理预检：可处理 ${preview.cleanableCount} 项，不可处理 ${preview.uncleanableCount} 项。` });
      if (!window.confirm(`确认清理 ${preview.cleanableCount} 项明确失败且未被修改的队列副本？发布失败记录会保留。`)) return;
      await cleanupFailedContentSubmissionItems(latestBatch.id);
      await refreshBatchAffectedArticles();
      setBatchFeedback({ kind: 'status', text: `已清理 ${preview.cleanableCount} 项失败队列副本；发布失败记录仍保留。` });
    } catch (value) { setBatchFeedback({ kind: 'error', text: value instanceof Error ? value.message : '清理失败队列项失败' }); }
    finally { setBusy(false); }
  }

  async function trashSelected() {
    if (!selectedArticles.length) return;
    setBusy(true); setError(''); setTrashFeedback(null);
    try {
      const preview = await previewContentArticleRemoval(selectedArticles.map((article) => ({ clientId: article.clientId, articleId: article.id })));
      setTrashPreview(preview);
    } catch (value) { setError(value instanceof Error ? value.message : '回收站预检失败'); }
    finally { setBusy(false); }
  }

  async function commitTrash() {
    if (!trashPreview || !trashPreview.canCommit || !selectedArticles.length) return;
    setBusy(true); setError('');
    try {
      const selections = trashPreview.selections || selectedArticles.map((article) => ({ clientId: article.clientId, articleId: article.id }));
      const result = await trashContentArticles({ articles: selections, selections, token: trashPreview.token, legacy: trashPreview.legacy, confirmed: true });
      setTrashPreview(null);
      setSelected([]);
      await refreshHistoryData();
      const status = result.status === 'pending_recovery' ? 'pending_recovery' : 'committed';
      setTrashFeedback(status === 'pending_recovery'
        ? { kind: 'status', text: `已确认移入回收站 ${result.articleCount || selections.length} 篇，正在恢复删除事务；队列和文章状态会继续自动推进。` }
        : { kind: 'status', text: `已将 ${result.articleCount || selections.length} 篇文章移入回收站；发布记录继续保留，恢复文章不会重新加入投稿队列。` });
    } catch (value) {
      setTrashFeedback({ kind: 'error', text: value instanceof Error ? value.message : '移入回收站失败；未完成的事务可稍后恢复' });
    } finally { setBusy(false); }
  }

  async function restoreOne(entry: ArticleTrashRecord) {
    if (!window.confirm(`确认恢复“${entry.titleSnapshot || entry.articleId}”？恢复文章不会重新加入投稿队列。`)) return;
    setBusy(true); setError('');
    try {
      await restoreContentArticle({ clientId: entry.clientId, articleId: entry.articleId });
      setTrash(await listContentTrash(clientId)); setArticles(await listContentArticles(clientId)); onRefreshArticles?.();
    } catch (value) { setError(value instanceof Error ? value.message : '恢复文章失败'); }
    finally { setBusy(false); }
  }

  async function permanentlyDeleteOne(entry: ArticleTrashRecord) {
    const confirmation = await preparePermanentDeleteContentArticle({ clientId: entry.clientId, articleId: entry.articleId });
    if (!window.confirm(`永久删除“${entry.articleId}”？正文和 Markdown 将不可恢复。`)) return;
    setBusy(true); setError('');
    try {
      await permanentlyDeleteContentArticle({ clientId: entry.clientId, articleId: entry.articleId, token: confirmation.token });
      setTrash(await listContentTrash(clientId));
    } catch (value) { setError(value instanceof Error ? value.message : '永久删除文章失败'); }
    finally { setBusy(false); }
  }

  function toggleAll() {
    const ids = operable.map(selectionKey);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  if (showTrash) return <div className="h-full overflow-y-auto p-4">
    <div className="mb-4 flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-slate-800">文章回收站</h2><p className="mt-1 text-xs text-slate-500">回收站只保留最小引用；投稿队列副本和投稿记录不会联动删除。</p></div><button type="button" onClick={() => setShowTrash(false)} className="rounded border border-slate-300 px-3 py-2 text-xs">返回历史文章</button></div>
    {error && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="grid gap-3">{trash.map((entry) => <div key={entry.articleId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3"><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold text-slate-800">{entry.titleSnapshot || `已删除文章 · ${entry.articleId.slice(-6)}`}</div><div className="mt-1 break-all text-xs text-slate-500">文章 ID：{entry.articleId} · {entry.status} · 删除于 {formatBeijingTime(entry.deletedAt)}</div><div className="mt-1 text-xs text-slate-600">只读发布详情：{trashPublicationSummary(entry)}</div>{entry.references?.length > 0 && <div className="mt-1 text-xs text-slate-400">关联记录：{entry.references.map((reference) => `${reference.type}/${reference.id}`).join('、')}</div>}</div><button type="button" disabled={busy} onClick={() => void restoreOne(entry)} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">恢复（不恢复队列）</button><button type="button" disabled={busy} onClick={() => void permanentlyDeleteOne(entry)} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">永久删除正文</button></div>)}{!trash.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">回收站为空</div>}</div>
  </div>;

  return <div className="h-full overflow-y-auto p-4">
    <div className="mb-4 grid min-w-0 gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-800">历史文章</h2>
        <p className="mt-1 max-w-prose text-xs leading-5 text-slate-500">当前客户的文章按平台和生成时模板版本分组。</p>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选标题、平台或模板" aria-label="筛选历史文章" className="h-9 min-w-0 w-full rounded-md border border-slate-300 px-2 text-xs" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="文章状态" className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-xs"><option value="all">全部状态</option><option value="generated">待审核</option><option value="saved">已审核</option><option value="queued">已入队</option></select>
        <select value={publicationFilter} onChange={(event) => setPublicationFilter(event.target.value as PublicationHistoryFilter)} aria-label="发布状态" className="h-9 min-w-0 rounded-md border border-slate-300 px-2 text-xs">{PUBLICATION_STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <button type="button" onClick={() => setShowTrash(true)} disabled={busy} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">打开回收站</button>
      </div>

       <div className="flex min-w-0 flex-wrap items-center gap-2">
         <button type="button" onClick={toggleAll} disabled={!operable.length || busy} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">全选当前结果</button>
         <button type="button" onClick={() => void reviewSelected()} disabled={!selectedReviewable.length || busy} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">审核已选 ({selectedReviewable.length})</button>
          <button type="button" onClick={() => void trashSelected()} disabled={!selectedArticles.length || busy} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">移入回收站 ({selectedArticles.length})</button>
         {latestBatch && latestBatchCancelableCount > 0 && <button type="button" title="撤销最近入队（仅未开始投稿）" onClick={() => void cancelLatestBatch()} disabled={busy} className="rounded border border-amber-300 px-3 py-2 text-xs text-amber-700 disabled:opacity-40">撤销未开始投稿 ({latestBatchCancelableCount})</button>}
         {latestBatch && latestBatchCleanupCount > 0 && <button type="button" onClick={() => void cleanupLatestBatch()} disabled={busy} className="rounded border border-orange-300 px-3 py-2 text-xs text-orange-700 disabled:opacity-40">清理失败队列项 ({latestBatchCleanupCount})</button>}
         {latestBatch && !latestBatchCancelableCount && !latestBatchCleanupCount && <span role="status" className="text-xs text-slate-500">最近批次当前没有可撤销或可清理项。</span>}
       </div>
        {batchFeedback && <div role={batchFeedback.kind === 'error' ? 'alert' : 'status'} aria-live={batchFeedback.kind === 'error' ? 'assertive' : 'polite'} tabIndex={batchFeedback.kind === 'error' ? -1 : undefined} className={`min-w-0 rounded border p-2 text-xs ${batchFeedback.kind === 'error' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{batchFeedback.text}</div>}
        {trashFeedback && <div role={trashFeedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`min-w-0 rounded border p-2 text-xs ${trashFeedback.kind === 'error' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{trashFeedback.text}</div>}

      <div className="flex min-w-0 flex-wrap items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-slate-500">投稿平台</span>
          {submissionPlatforms.map((platform) => <button key={platform.id} type="button" onClick={() => setTargetPlatformIds((current) => current.includes(platform.id) ? current.filter((id) => id !== platform.id) : [...current, platform.id])} className={`rounded border px-2 py-1 text-xs ${targetPlatformIds.includes(platform.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600'}`}>{platform.displayName || platform.id}</button>)}
        </div>
        <button type="button" onClick={() => void queueSelected()} disabled={!selectedArticles.some((article) => article.status === 'saved') || !targetPlatformIds.length || busy} className="shrink-0 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">加入投稿队列</button>
      </div>
    </div>
    {error && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="grid gap-3">
      {groups.map((group) => {
        const groupSelectable = selectableArticles(group.articles, clientId);
        const groupSelection = selectionState(group.articles, selected, clientId);
        const groupReviewable = groupSelectable.filter((article) => article.status === 'generated');
        const isCollapsed = collapsed[group.key] !== false;
        const templateSnapshot = group.templateSnapshot;
        const snapshotBody = summarizeTemplateSnapshot(templateSnapshot);
        return <section key={group.key} className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            <input type="checkbox" aria-label={`全选 ${group.label}`} checked={groupSelection.checked} ref={(element) => { if (element) element.indeterminate = groupSelection.indeterminate; }} onChange={() => toggleGroup(group.articles)} disabled={groupSelection.disabled || busy} />
            <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !isCollapsed }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{group.platform} · {group.label}</span><span className="mt-1 block text-xs text-slate-500">{group.articles.length} 篇 · 待审核 {groupReviewable.length} · 最新 {formatBeijingTime(group.articles[0]?.createdAt)}</span>{templateSnapshot && <span className="mt-1 block truncate text-xs text-slate-400">场景：{templateSnapshot.scenario} · 正文解释：{snapshotBody}</span>}</span>
            </button>
          </div>
          {!isCollapsed && <div className="min-w-0 divide-y divide-slate-100">{group.articles.map((article) => <div key={article.id} className="flex min-w-0 flex-wrap items-start gap-3 p-3">
             <input type="checkbox" aria-label={`选择 ${article.title}`} checked={selected.includes(selectionKey(article))} onChange={() => toggleArticle(article)} disabled={(article.status !== 'generated' && article.status !== 'saved') || busy} className="mt-1" />
             <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
             <button type="button" onClick={(event) => openArticle(article, event.currentTarget, publicationRecordsByArticle.get(article.id)?.some((record) => record.status === 'published') === true)} className="min-w-0 flex-[1_1_16rem] text-left hover:text-blue-700"><span className="block break-words text-sm font-semibold text-slate-800 sm:truncate">{article.title}</span><span className="mt-1 block break-words text-xs text-slate-500">审核：{article.status}{queuedArticleIds.has(article.id) ? ' · 已入队' : ''} · 版本：{article.version || 1} · {formatBeijingTime(article.createdAt)} · 发布：{publicationSummaries.get(article.id)?.label || '未投稿'}</span></button>
             <button type="button" onClick={() => setDrawerArticle(article)} className="shrink-0 rounded border border-slate-300 px-2 py-2 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-700">发布详情</button>
           </div>)}</div>}
        </section>;
      })}
      {!groups.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">暂无历史文章</div>}
    </div>
    {trashPreview && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="移入回收站预检"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-slate-800">移入回收站预检</h3><p className="mt-1 text-xs leading-5 text-slate-500">一次确认将移入回收站并联动全部发布目标；发布记录继续保留。</p></div><button type="button" onClick={() => setTrashPreview(null)} disabled={busy} aria-label="关闭回收站预检" className="rounded p-1 text-slate-400 hover:bg-slate-100">×</button></div><div className="mt-4 grid gap-2 text-sm text-slate-700"><div>文章数：<strong>{trashPreview.articleCount}</strong></div><div>按平台撤销 queued：{groupImpact(trashPreview.queuedToCancel).map(([platform, count]) => <span key={platform} className="ml-2 inline-flex rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{platform} {count}</span>)}{!trashPreview.queuedToCancel.length && <span className="ml-2 text-xs text-slate-400">无</span>}</div><div>按平台清理 failed：{groupImpact(trashPreview.failedToClean).map(([platform, count]) => <span key={platform} className="ml-2 inline-flex rounded bg-orange-50 px-2 py-1 text-xs text-orange-800">{platform} {count}</span>)}{!trashPreview.failedToClean.length && <span className="ml-2 text-xs text-slate-400">无</span>}</div></div>{trashPreview.blockedItems.length > 0 && <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3"><div className="text-sm font-semibold text-rose-800">阻止项（整批不可提交）</div><ul className="mt-2 grid gap-1 text-xs text-rose-700">{trashPreview.blockedItems.map((item, index) => <li key={`${item.articleId || 'article'}-${index}`}>{item.articleId || '文章'} · {impactPlatform(item)} · {item.reasonCode || item.status || '状态冲突'}</li>)}</ul><p className="mt-2 text-xs text-rose-700">请取消选择风险文章后重新预检。</p></div>}{trashPreview.canCommit && <div className="mt-4 rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">确认后会撤销可撤销的 queued、清理明确 failed 队列副本，并将文章移入回收站；发布记录和失败记录继续保留。</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTrashPreview(null)} disabled={busy} className="rounded border border-slate-300 px-3 py-2 text-xs">取消</button><button type="button" onClick={() => void commitTrash()} disabled={!trashPreview.canCommit || busy} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">确认移入回收站</button></div></div></div>}
    <PublicationHistoryDrawer article={drawerArticle} records={drawerArticle ? (publicationRecordsByArticle.get(drawerArticle.id) || []) : []} onClose={() => setDrawerArticle(null)} onCopyVersion={() => void copyPublishedVersion()} onReconcile={(record, status) => void reconcilePublication(record, status)} busy={busy} />
  </div>;
}
