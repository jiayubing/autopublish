import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { cancelContentSubmissionBatch, createContentSubmissionBatch, listContentArticles, listContentSubmissionBatches, listContentSubmissionPlatforms, listContentTrash, permanentlyDeleteContentArticle, preparePermanentDeleteContentArticle, previewCancelContentSubmissionBatch, previewContentSubmissionBatch, restoreContentArticle, reviewContentArticles, trashContentArticles, type ArticleTrashRecord } from '../../electron-api';
import { groupArticlesByTemplate, summarizeTemplateSnapshot } from '../../article-history-logic';
import { ContentSubmissionPlatform, GeneratedContentArticle } from '../../types';
import { formatBeijingTime } from '../../time-format';

interface GeneratedArticlesViewProps { clientId: string; refreshToken: number; onArticleSelect: (article: GeneratedContentArticle) => void; onRefresh?: () => void; }

function selectionKey(article: GeneratedContentArticle) { return article.clientId + '\u0000' + article.id; }

export default function GeneratedArticlesView({ clientId, refreshToken, onArticleSelect, onRefresh }: GeneratedArticlesViewProps) {
  const [articles, setArticles] = useState<GeneratedContentArticle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submissionPlatforms, setSubmissionPlatforms] = useState<ContentSubmissionPlatform[]>([]);
  const [targetPlatformIds, setTargetPlatformIds] = useState<string[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trash, setTrash] = useState<ArticleTrashRecord[]>([]);
  const [submissionBatches, setSubmissionBatches] = useState<Array<{ id: string; status: string; items: Array<{ articleId: string; status: string }> }>>([]);

  useEffect(() => {
    if (!clientId) { setArticles([]); setSelected([]); setSubmissionBatches([]); return; }
    listContentArticles(clientId).then(setArticles).catch((value) => setError(value instanceof Error ? value.message : '无法加载历史文章'));
    listContentSubmissionBatches(clientId).then(setSubmissionBatches).catch(() => setSubmissionBatches([]));
  }, [clientId, refreshToken]);

  useEffect(() => {
    listContentSubmissionPlatforms().then((platforms) => setSubmissionPlatforms(platforms.filter((platform) => platform.contentQueueImport))).catch(() => setSubmissionPlatforms([]));
  }, []);

  useEffect(() => {
    if (!clientId || !showTrash) return;
    listContentTrash(clientId).then(setTrash).catch((value) => setError(value instanceof Error ? value.message : '无法加载回收站'));
  }, [clientId, refreshToken, showTrash]);

  const queuedArticleIds = useMemo(() => new Set(submissionBatches.flatMap((batch) => batch.status === 'queued' ? batch.items.filter((item) => item.status === 'queued').map((item) => item.articleId) : [])), [submissionBatches]);
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return articles.filter((article) => {
      const statusMatches = statusFilter === 'all' || (statusFilter === 'queued' ? queuedArticleIds.has(article.id) : article.status === statusFilter);
      const textMatches = !query || `${article.title} ${article.content} ${article.platform} ${article.templateId} ${article.templateSnapshot?.name || ''} ${article.templateSnapshot?.scenario || ''} ${article.templateSnapshot?.body || ''}`.toLowerCase().includes(query);
      return statusMatches && textMatches;
    });
  }, [articles, filter, statusFilter, queuedArticleIds]);
  const groups = useMemo(() => groupArticlesByTemplate(filtered), [filtered]);
  const reviewable = filtered.filter((article) => article.status === 'generated');
  const selectedReviewable = reviewable.filter((article) => selected.includes(selectionKey(article)));
  const selectedArticles = filtered.filter((article) => selected.includes(selectionKey(article)));
  const latestQueuedBatch = submissionBatches.find((batch) => batch.status === 'queued');

  function toggleArticle(article: GeneratedContentArticle) {
    if (article.status !== 'generated' && article.status !== 'saved') return;
    const key = selectionKey(article);
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function toggleGroup(groupArticles: GeneratedContentArticle[]) {
    const ids = groupArticles.filter((article) => article.status === 'generated' || article.status === 'saved').map(selectionKey);
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
      onRefresh?.();
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
      if (!window.confirm(`确认将 ${preview.queueableTaskCount} 项内容加入投稿队列？`)) return;
      await createContentSubmissionBatch({ ...input, confirmed: true });
      setSelected([]); setArticles(await listContentArticles(clientId)); setSubmissionBatches(await listContentSubmissionBatches(clientId)); onRefresh?.();
    } catch (value) { setError(value instanceof Error ? value.message : '批量入队失败'); }
    finally { setBusy(false); }
  }

  async function cancelLatestBatch() {
    if (!latestQueuedBatch) return;
    setBusy(true); setError('');
    try {
      const preview = await previewCancelContentSubmissionBatch(latestQueuedBatch.id);
      if (!preview.cancelableCount) throw new Error('最近投稿批次没有可撤销项');
      if (!window.confirm(`确认撤销最近投稿批次的 ${preview.cancelableCount} 项内容？`)) return;
      await cancelContentSubmissionBatch(latestQueuedBatch.id);
      setSubmissionBatches(await listContentSubmissionBatches(clientId));
    } catch (value) { setError(value instanceof Error ? value.message : '撤销投稿批次失败'); }
    finally { setBusy(false); }
  }

  async function trashSelected() {
    if (!selectedArticles.length || !window.confirm(`确认删除历史文章 ${selectedArticles.length} 篇？文章会进入回收站，投稿队列副本和记录不会删除。`)) return;
    if (selectedArticles.some((article) => article.status === 'saved') && !window.confirm('其中包含已审核文章，可能已经进入投稿队列。请再次确认删除原文？')) return;
    setBusy(true); setError('');
    try {
      const result = await trashContentArticles({ articles: selectedArticles.map((article) => ({ clientId: article.clientId, articleId: article.id })), confirmed: true });
      if (result.rejected.length) setError(`有 ${result.rejected.length} 篇文章未能移入回收站`);
      setSelected([]); setArticles(await listContentArticles(clientId)); onRefresh?.();
    } catch (value) { setError(value instanceof Error ? value.message : '删除历史文章失败'); }
    finally { setBusy(false); }
  }

  async function restoreOne(entry: ArticleTrashRecord) {
    setBusy(true); setError('');
    try {
      await restoreContentArticle({ clientId: entry.clientId, articleId: entry.articleId });
      setTrash(await listContentTrash(clientId)); setArticles(await listContentArticles(clientId)); onRefresh?.();
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
    const ids = reviewable.map(selectionKey);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  if (showTrash) return <div className="h-full overflow-y-auto p-4">
    <div className="mb-4 flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-slate-800">文章回收站</h2><p className="mt-1 text-xs text-slate-500">回收站只保留最小引用；投稿队列副本和投稿记录不会联动删除。</p></div><button type="button" onClick={() => setShowTrash(false)} className="rounded border border-slate-300 px-3 py-2 text-xs">返回历史文章</button></div>
    {error && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="grid gap-3">{trash.map((entry) => <div key={entry.articleId} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{entry.articleId}</div><div className="mt-1 text-xs text-slate-500">{entry.status} · 删除于 {formatBeijingTime(entry.deletedAt)}</div></div><button type="button" disabled={busy} onClick={() => void restoreOne(entry)} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">恢复</button><button type="button" disabled={busy} onClick={() => void permanentlyDeleteOne(entry)} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">永久删除</button></div>)}{!trash.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">回收站为空</div>}</div>
  </div>;

  return <div className="h-full overflow-y-auto p-4">
    <div className="mb-4 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-slate-800">历史文章</h2><p className="mt-1 text-xs text-slate-500">当前客户的文章按平台和生成时模板版本分组。</p></div>
      <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选标题、平台或模板" aria-label="筛选历史文章" className="h-9 rounded-md border border-slate-300 px-2 text-xs" />
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="文章状态" className="h-9 rounded-md border border-slate-300 px-2 text-xs"><option value="all">全部状态</option><option value="generated">待审核</option><option value="saved">已审核</option><option value="queued">已入队</option></select>
      <button type="button" onClick={() => setShowTrash(true)} disabled={busy} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">打开回收站</button>
      <button type="button" onClick={toggleAll} disabled={!reviewable.length || busy} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">全选当前结果</button>
      <button type="button" onClick={() => void reviewSelected()} disabled={!selectedReviewable.length || busy} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">审核已选 ({selectedReviewable.length})</button>
      <button type="button" onClick={() => void trashSelected()} disabled={!selectedArticles.length || busy} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">删除历史文章 ({selectedArticles.length})</button>
      {latestQueuedBatch && <button type="button" onClick={() => void cancelLatestBatch()} disabled={busy} className="rounded border border-amber-300 px-3 py-2 text-xs text-amber-700 disabled:opacity-40">撤销最近入队</button>}
      {submissionPlatforms.map((platform) => <button key={platform.id} type="button" onClick={() => setTargetPlatformIds((current) => current.includes(platform.id) ? current.filter((id) => id !== platform.id) : [...current, platform.id])} className={`rounded border px-2 py-1 text-xs ${targetPlatformIds.includes(platform.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600'}`}>{platform.displayName}</button>)}
      <button type="button" onClick={() => void queueSelected()} disabled={!selectedArticles.some((article) => article.status === 'saved') || !targetPlatformIds.length || busy} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">加入投稿队列</button>
    </div>
    {error && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="grid gap-3">
      {groups.map((group) => {
        const groupReviewable = group.articles.filter((article) => article.status === 'generated');
        const groupSelected = groupReviewable.length > 0 && groupReviewable.every((article) => selected.includes(selectionKey(article)));
        const isCollapsed = collapsed[group.key] !== false;
        const templateSnapshot = group.templateSnapshot;
        const snapshotBody = summarizeTemplateSnapshot(templateSnapshot);
        return <section key={group.key} className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            <input type="checkbox" aria-label={`全选 ${group.label}`} checked={groupSelected} onChange={() => toggleGroup(group.articles)} disabled={!groupReviewable.length || busy} />
            <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !isCollapsed }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{group.platform} · {group.label}</span><span className="mt-1 block text-xs text-slate-500">{group.articles.length} 篇 · 待审核 {groupReviewable.length} · 最新 {formatBeijingTime(group.articles[0]?.createdAt)}</span>{templateSnapshot && <span className="mt-1 block truncate text-xs text-slate-400">场景：{templateSnapshot.scenario} · 正文解释：{snapshotBody}</span>}</span>
            </button>
          </div>
          {!isCollapsed && <div className="divide-y divide-slate-100">{group.articles.map((article) => <div key={article.id} className="flex items-start gap-3 p-3">
            <input type="checkbox" aria-label={`选择 ${article.title}`} checked={selected.includes(selectionKey(article))} onChange={() => toggleArticle(article)} disabled={(article.status !== 'generated' && article.status !== 'saved') || busy} className="mt-1" />
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <button type="button" onClick={() => onArticleSelect(article)} className="min-w-0 flex-1 text-left hover:text-blue-700"><span className="block truncate text-sm font-semibold text-slate-800">{article.title}</span><span className="mt-1 block text-xs text-slate-500">{article.status}{queuedArticleIds.has(article.id) ? ' · 已入队' : ''} · {formatBeijingTime(article.createdAt)}</span></button>
          </div>)}</div>}
        </section>;
      })}
      {!groups.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">暂无历史文章</div>}
    </div>
  </div>;
}
