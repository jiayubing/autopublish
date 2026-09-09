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
      className="flex min-w-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "all"}
        onClick={() => onChange("all")}
        className={`relative flex min-h-10 items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors ${
          value === "all"
            ? "text-blue-600"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        全部
        {value === "all" && (
          <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-600" />
        )}
      </button>
      {ARTICLE_WORKFLOW_STAGES.map((stage) => {
        const count = counts?.[stage.id];
        const active = value === stage.id;
        return (
          <button
            key={stage.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={count === undefined ? stage.label : `${stage.label} (${count})`}
            onClick={() => onChange(stage.id)}
            className={`relative flex min-h-10 items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors ${
              active
                ? "text-blue-600"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {stage.label}
            {count === undefined ? null : (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active
                    ? "bg-blue-50 text-blue-600"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-600" />
            )}
          </button>
        );
      })}
    </div>
  );
}
