import React from 'react';
import { ARTICLE_WORKFLOW_STAGES, type ArticleWorkflowFilter, type ArticleWorkflowStage } from '../../article-workflow';

export default function ArticleStageTabs({ value, onChange, counts, attentionCount = 0 }: { value: ArticleWorkflowFilter; onChange: (value: ArticleWorkflowFilter) => void; counts?: Partial<Record<ArticleWorkflowStage, number>>; attentionCount?: number }) {
  return <div role="tablist" aria-label="文章库筛选" className="flex min-w-0 flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
    {ARTICLE_WORKFLOW_STAGES.map((stage) => {
      const count = counts?.[stage.id];
      return <button key={stage.id} type="button" role="tab" aria-selected={value === stage.id} onClick={() => onChange(stage.id)} className={`rounded px-2.5 py-1.5 text-xs font-semibold ${value === stage.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{stage.label}{count === undefined ? '' : ` (${count})`}</button>;
    })}
    <button type="button" role="tab" aria-selected={value === 'attention'} onClick={() => onChange('attention')} className={`rounded px-2.5 py-1.5 text-xs font-semibold ${value === 'attention' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>需处理 ({attentionCount})</button>
  </div>;
}
