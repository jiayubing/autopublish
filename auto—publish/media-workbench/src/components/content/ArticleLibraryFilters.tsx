import React from "react";
import {
  ARTICLE_WORKFLOW_STAGES,
  type ArticleWorkflowFilter,
  type ArticleWorkflowStage,
} from "../../article-workflow";

interface ArticleLibraryFiltersProps {
  value: ArticleWorkflowFilter;
  onChange: (value: ArticleWorkflowFilter) => void;
  counts?: Partial<Record<ArticleWorkflowStage, number>>;
}

export default function ArticleLibraryFilters({
  value,
  onChange,
  counts,
}: ArticleLibraryFiltersProps) {
  return (
    <div
      role="tablist"
      aria-label="文章库分类筛选"
      className="flex min-w-0 flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "all"}
        onClick={() => onChange("all")}
        className={`rounded px-2.5 py-1.5 text-xs font-semibold ${value === "all" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
      >
        全部
      </button>
      {ARTICLE_WORKFLOW_STAGES.map((stage) => {
        const count = counts?.[stage.id];
        return (
          <button
            key={stage.id}
            type="button"
            role="tab"
            aria-selected={value === stage.id}
            onClick={() => onChange(stage.id)}
            className={`rounded px-2.5 py-1.5 text-xs font-semibold ${value === stage.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {stage.label}
            {count === undefined ? "" : ` (${count})`}
          </button>
        );
      })}
    </div>
  );
}
