import React from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { articleSelectionKey, selectableArticles, selectionState, summarizeTemplateSnapshot } from '../../article-history-logic';
import type { GeneratedContentArticle } from '../../types/generation';
import type { ArticleWorkflowStage } from '../../article-workflow';
import type { PublicationHistorySummary } from '../../types/publication';
import { publicationStatusLabel } from '../../publication-status';
import { formatBeijingTime } from '../../time-format';

export interface ArticleGroup {
  key: string;
  platform: string;
  label: string;
  templateSnapshot: GeneratedContentArticle['templateSnapshot'] | null;
  articles: GeneratedContentArticle[];
}

interface GeneratedArticlesListProps {
  groups: ArticleGroup[];
  visibleError: string;
  clientId: string;
  collapsed: Record<string, boolean>;
  selected: string[];
  workflowByArticle: ReadonlyMap<string, { stage: ArticleWorkflowStage; label?: string; publicationSummary?: PublicationHistorySummary; orderSummary?: { status: string } } | undefined>;
  isArticleSelectable: (article: GeneratedContentArticle) => boolean;
  isArticleQueueable: (article: GeneratedContentArticle) => boolean;
  removalSubmitDisabled: boolean;
  commandBusy: (...names: string[]) => boolean;
  onToggleCollapsed: (key: string) => void;
  onToggleGroup: (articles: GeneratedContentArticle[]) => void;
  onToggleArticle: (article: GeneratedContentArticle) => void;
  onOpenArticle: (article: GeneratedContentArticle, source: HTMLElement, published: boolean) => void;
  onOpenPublication: (article: GeneratedContentArticle) => void;
  onOpenOrder?: () => void;
}

export default function GeneratedArticlesList({ groups, visibleError, clientId, collapsed, selected, workflowByArticle, isArticleSelectable, isArticleQueueable, removalSubmitDisabled, commandBusy, onToggleCollapsed, onToggleGroup, onToggleArticle, onOpenArticle, onOpenPublication, onOpenOrder }: GeneratedArticlesListProps) {
  return <div className="grid gap-3">
    {groups.map((group) => {
      const groupSelectable = selectableArticles(group.articles, clientId).filter(isArticleSelectable);
      const groupQueueable = selectableArticles(group.articles, clientId).filter(isArticleQueueable);
      const groupSelection = selectionState(groupSelectable, selected, clientId);
      const isCollapsed = collapsed[group.key] !== false;
      const snapshotBody = summarizeTemplateSnapshot(group.templateSnapshot);
      return <section key={group.key} className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-100 p-3">
          <input type="checkbox" aria-label={`全选 ${group.label}`} checked={groupSelection.checked} ref={(element) => { if (element) element.indeterminate = groupSelection.indeterminate; }} onChange={() => onToggleGroup(group.articles)} disabled={groupSelection.disabled} />
          <button type="button" onClick={() => onToggleCollapsed(group.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{group.platform} · {group.label}</span><span className="mt-1 block text-xs text-slate-500">{group.articles.length} 篇 · 待投稿 {groupQueueable.length} · 最新 {formatBeijingTime(group.articles[0]?.createdAt)}</span>{group.templateSnapshot && <span className="mt-1 block truncate text-xs text-slate-400">场景：{group.templateSnapshot.scenario} · 正文解释：{snapshotBody}</span>}</span>
          </button>
        </div>
        {!isCollapsed && <div className="min-w-0 divide-y divide-slate-100">{group.articles.map((article) => {
          const workflow = workflowByArticle.get(article.id);
          const stageLabel = workflow?.label || '状态不可用';
          const summary = workflow?.publicationSummary;
          const summaryLabel = summary ? (summary.label || publicationStatusLabel(summary.status)) : '状态不可用';
          return <div key={article.id} className="flex min-w-0 flex-wrap items-start gap-3 p-3">
          <input type="checkbox" aria-label={`选择 ${article.title}`} checked={selected.includes(articleSelectionKey(article))} onChange={() => onToggleArticle(article)} disabled={!isArticleSelectable(article)} className="mt-1" />
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <button type="button" disabled={!workflow} aria-disabled={!workflow} title={!workflow ? '文章流程状态不可用，暂不能打开编辑器' : undefined} onClick={(event) => { if (!workflow) return; onOpenArticle(article, event.currentTarget, workflow.stage === 'published'); }} className="min-w-0 flex-[1_1_16rem] text-left hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"><span className="block break-words text-sm font-semibold text-slate-800 sm:truncate">{article.title}</span><span className="mt-1 block break-words text-xs text-slate-500">阶段：{stageLabel} · {formatBeijingTime(article.createdAt)} · 发布：{summaryLabel}</span></button>
          <button type="button" onClick={() => workflow?.orderSummary?.status === 'processing' && onOpenOrder ? onOpenOrder() : onOpenPublication(article)} className="shrink-0 rounded border border-slate-300 px-2 py-2 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-700">{workflow?.orderSummary?.status === 'processing' ? '查看订单' : '发布详情'}</button>
        </div>})}</div>}
      </section>;
    })}
    {!groups.length && !visibleError && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">暂无历史文章</div>}
  </div>;
}
