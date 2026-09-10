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

function FilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`group relative inline-flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
            active
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
          }`}
        >
          {count}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600" />
      )}
    </button>
  );
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
      className="flex min-w-0 flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
    >
      <FilterButton
        active={value === "all"}
        label="全部"
        onClick={() => onChange("all")}
      />
      {ARTICLE_WORKFLOW_STAGES.map((stage) => (
        <FilterButton
          key={stage.id}
          active={value === stage.id}
          label={stage.label}
          count={counts?.[stage.id]}
          onClick={() => onChange(stage.id)}
        />
      ))}
    </div>
  );
}
