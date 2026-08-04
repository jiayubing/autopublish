import React from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { articleSelectionKey, selectableArticles, selectionState, summarizeTemplateSnapshot } from '../../article-history-logic';
import type { GeneratedContentArticle } from '../../types/generation';
import type { ArticleWorkflowStage } from '../../article-workflow';
import type { PublicationHistoryRecord } from '../../types/publication';
import { summarizePublicationRecords } from '../../publication-status';
import { formatBeijingTime } from '../../time-format';

export interface ArticleGroup {
  key: string;
  platform: string;
  label: string;
  templateSnapshot: GeneratedContentArticle['templateSnapshot'] | null;
  articles: GeneratedContentArticle[];
}

type PublicationSummary = ReturnType<typeof summarizePublicationRecords>;

interface GeneratedArticlesListProps {
  groups: ArticleGroup[];
  visibleError: string;
  clientId: string;
  collapsed: Record<string, boolean>;
  selected: string[];
  queuedArticleIds: ReadonlySet<string>;
  publicationRecordsByArticle: ReadonlyMap<string, PublicationHistoryRecord[]>;
  publicationSummaries: ReadonlyMap<string, PublicationSummary>;
  workflowByArticle: ReadonlyMap<string, { stage: ArticleWorkflowStage } | undefined>;
  removalSubmitDisabled: boolean;
  commandBusy: (...names: string[]) => boolean;
  onToggleCollapsed: (key: string) => void;
  onToggleGroup: (articles: GeneratedContentArticle[]) => void;
  onToggleArticle: (article: GeneratedContentArticle) => void;
  onOpenArticle: (article: GeneratedContentArticle, source: HTMLElement, published: boolean) => void;
  onOpenPublication: (article: GeneratedContentArticle) => void;
  onTrashPublishedArticle: (article: GeneratedContentArticle) => void;
}

export default function GeneratedArticlesList({ groups, visibleError, clientId, collapsed, selected, queuedArticleIds, publicationRecordsByArticle, publicationSummaries, workflowByArticle, removalSubmitDisabled, commandBusy, onToggleCollapsed, onToggleGroup, onToggleArticle, onOpenArticle, onOpenPublication, onTrashPublishedArticle }: GeneratedArticlesListProps) {
  return <div className="grid gap-3">
    {groups.map((group) => {
      const groupSelectable = selectableArticles(group.articles, clientId);
      const groupSelection = selectionState(group.articles, selected, clientId);
      const isCollapsed = collapsed[group.key] !== false;
      const snapshotBody = summarizeTemplateSnapshot(group.templateSnapshot);
      return <section key={group.key} className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-100 p-3">
          <input type="checkbox" aria-label={`全选 ${group.label}`} checked={groupSelection.checked} ref={(element) => { if (element) element.indeterminate = groupSelection.indeterminate; }} onChange={() => onToggleGroup(group.articles)} disabled={groupSelection.disabled} />
          <button type="button" onClick={() => onToggleCollapsed(group.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{group.platform} · {group.label}</span><span className="mt-1 block text-xs text-slate-500">{group.articles.length} 篇 · 待投稿 {groupSelectable.length} · 最新 {formatBeijingTime(group.articles[0]?.createdAt)}</span>{group.templateSnapshot && <span className="mt-1 block truncate text-xs text-slate-400">场景：{group.templateSnapshot.scenario} · 正文解释：{snapshotBody}</span>}</span>
          </button>
        </div>
        {!isCollapsed && <div className="min-w-0 divide-y divide-slate-100">{group.articles.map((article) => <div key={article.id} className="flex min-w-0 flex-wrap items-start gap-3 p-3">
          <input type="checkbox" aria-label={`选择 ${article.title}`} checked={selected.includes(articleSelectionKey(article))} onChange={() => onToggleArticle(article)} disabled={article.status !== 'generated' && article.status !== 'saved'} className="mt-1" />
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <button type="button" onClick={(event) => onOpenArticle(article, event.currentTarget, publicationRecordsByArticle.get(article.id)?.some((record) => record.status === 'published') === true)} className="min-w-0 flex-[1_1_16rem] text-left hover:text-blue-700"><span className="block break-words text-sm font-semibold text-slate-800 sm:truncate">{article.title}</span><span className="mt-1 block break-words text-xs text-slate-500">状态：{article.status}{queuedArticleIds.has(article.id) ? ' · 已入队' : ''} · 版本：{article.version || 1} · {formatBeijingTime(article.createdAt)} · 发布：{publicationSummaries.get(article.id)?.label || '未投稿'}</span></button>
          <button type="button" onClick={() => onOpenPublication(article)} className={`shrink-0 rounded border px-2 py-2 text-xs ${workflowByArticle.get(article.id)?.stage === 'failed' ? 'border-amber-300 text-amber-700 hover:border-amber-400' : 'border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700'}`}>{workflowByArticle.get(article.id)?.stage === 'failed' ? '打开需处理' : '发布详情'}</button>
          {workflowByArticle.get(article.id)?.stage === 'published' && <button type="button" onClick={() => onTrashPublishedArticle(article)} disabled={commandBusy('previewContentArticleRemoval', 'trashContentArticles') || removalSubmitDisabled} className="shrink-0 rounded border border-rose-300 px-2 py-2 text-xs text-rose-700 disabled:opacity-40">移入回收站</button>}
        </div>)}</div>}
      </section>;
    })}
    {!groups.length && !visibleError && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">暂无历史文章</div>}
  </div>;
}
