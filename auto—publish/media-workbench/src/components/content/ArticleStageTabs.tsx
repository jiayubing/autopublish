import React from 'react';
import { ARTICLE_WORKFLOW_STAGES, type ArticleWorkflowStage } from '../../article-workflow';

export default function ArticleStageTabs({ value, onChange }: { value: ArticleWorkflowStage | 'all'; onChange: (value: ArticleWorkflowStage | 'all') => void }) {
  return <div role="tablist" aria-label="文章流程阶段" className="flex min-w-0 flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
    {ARTICLE_WORKFLOW_STAGES.map((stage) => <button key={stage.id} type="button" role="tab" aria-selected={value === stage.id} onClick={() => onChange(stage.id)} className={`rounded px-2.5 py-1.5 text-xs font-semibold ${value === stage.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{stage.label}</button>)}
  </div>;
}
