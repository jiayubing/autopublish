import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { listContentArticles, reviewContentArticles } from '../../electron-api';
import { groupArticlesByTemplate } from '../../article-history-logic';
import { GeneratedContentArticle } from '../../types';

interface GeneratedArticlesViewProps { clientId: string; refreshToken: number; onArticleSelect: (article: GeneratedContentArticle) => void; onRefresh?: () => void; }

function selectionKey(article: GeneratedContentArticle) { return article.clientId + '\u0000' + article.id; }

export default function GeneratedArticlesView({ clientId, refreshToken, onArticleSelect, onRefresh }: GeneratedArticlesViewProps) {
  const [articles, setArticles] = useState<GeneratedContentArticle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId) { setArticles([]); setSelected([]); return; }
    listContentArticles(clientId).then(setArticles).catch((value) => setError(value instanceof Error ? value.message : '无法加载历史文章'));
  }, [clientId, refreshToken]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? articles.filter((article) => `${article.title} ${article.content} ${article.platform} ${article.templateId}`.toLowerCase().includes(query)) : articles;
  }, [articles, filter]);
  const groups = useMemo(() => groupArticlesByTemplate(filtered), [filtered]);
  const reviewable = filtered.filter((article) => article.status === 'generated');
  const selectedReviewable = reviewable.filter((article) => selected.includes(selectionKey(article)));

  function toggleArticle(article: GeneratedContentArticle) {
    if (article.status !== 'generated') return;
    const key = selectionKey(article);
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function toggleGroup(groupArticles: GeneratedContentArticle[]) {
    const ids = groupArticles.filter((article) => article.status === 'generated').map(selectionKey);
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

  function toggleAll() {
    const ids = reviewable.map(selectionKey);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  return <div className="h-full overflow-y-auto p-4">
    <div className="mb-4 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-slate-800">历史文章</h2><p className="mt-1 text-xs text-slate-500">当前客户的文章按平台和生成时模板版本分组。</p></div>
      <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选标题、平台或模板" aria-label="筛选历史文章" className="h-9 rounded-md border border-slate-300 px-2 text-xs" />
      <button type="button" onClick={toggleAll} disabled={!reviewable.length || busy} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">全选当前结果</button>
      <button type="button" onClick={() => void reviewSelected()} disabled={!selectedReviewable.length || busy} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">审核已选 ({selectedReviewable.length})</button>
    </div>
    {error && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="grid gap-3">
      {groups.map((group) => {
        const groupReviewable = group.articles.filter((article) => article.status === 'generated');
        const groupSelected = groupReviewable.length > 0 && groupReviewable.every((article) => selected.includes(selectionKey(article)));
        const isCollapsed = collapsed[group.key] !== false;
        return <section key={group.key} className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            <input type="checkbox" aria-label={`全选 ${group.label}`} checked={groupSelected} onChange={() => toggleGroup(group.articles)} disabled={!groupReviewable.length || busy} />
            <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [group.key]: !isCollapsed }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{group.platform} · {group.label}</span><span className="mt-1 block text-xs text-slate-500">{group.articles.length} 篇 · 待审核 {groupReviewable.length} · 最新 {group.articles[0]?.createdAt || ''}</span></span>
            </button>
          </div>
          {!isCollapsed && <div className="divide-y divide-slate-100">{group.articles.map((article) => <div key={article.id} className="flex items-start gap-3 p-3">
            <input type="checkbox" aria-label={`选择 ${article.title}`} checked={selected.includes(selectionKey(article))} onChange={() => toggleArticle(article)} disabled={article.status !== 'generated' || busy} className="mt-1" />
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <button type="button" onClick={() => onArticleSelect(article)} className="min-w-0 flex-1 text-left hover:text-blue-700"><span className="block truncate text-sm font-semibold text-slate-800">{article.title}</span><span className="mt-1 block text-xs text-slate-500">{article.status} · {article.createdAt}</span></button>
          </div>)}</div>}
        </section>;
      })}
      {!groups.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">暂无历史文章</div>}
    </div>
  </div>;
}
