import React from "react";
import { ChevronDown, FileText } from "lucide-react";
import {
  articleSelectionKey,
  publishedTimeFactsByArticle,
  selectableArticles,
  selectionState,
} from "../../article-history-logic";
import type { GeneratedContentArticle } from "../../types/generation";
import type { ArticleWorkflowStage } from "../../article-workflow";
import type {
  PublicationArchiveEntry,
  PublicationHistorySummary,
} from "../../types/publication";
import { publicationStatusLabel } from "../../publication-status";
import { formatBeijingTime } from "../../time-format";
import { StatusBadge } from "../ui/primitives";

export interface ArticleGroup {
  key: string;
  platform: string;
  label: string;
  templateSnapshot: GeneratedContentArticle["templateSnapshot"] | null;
  displayTitle?: string;
  articleAnnotations?: Record<string, string>;
  articles: GeneratedContentArticle[];
}

interface GeneratedArticlesListProps {
  groups: ArticleGroup[];
  visibleError: string;
  clientId: string;
  collapsed: Record<string, boolean>;
  selected: string[];
  workflowByArticle: ReadonlyMap<
    string,
    | {
        stage: ArticleWorkflowStage;
        label?: string;
        publicationSummary?: PublicationHistorySummary;
        orderSummary?: { status: string };
      }
    | undefined
  >;
  publishedArchives: PublicationArchiveEntry[];
  publishedView: boolean;
  isArticleSelectable: (article: GeneratedContentArticle) => boolean;
  isArticleSubmittable: (article: GeneratedContentArticle) => boolean;
  removalSubmitDisabled: boolean;
  commandBusy: (...names: string[]) => boolean;
  onToggleCollapsed: (key: string) => void;
  onToggleGroup: (articles: GeneratedContentArticle[]) => void;
  onToggleArticle: (article: GeneratedContentArticle) => void;
  onOpenArticle: (
    article: GeneratedContentArticle,
    source: HTMLElement,
    published: boolean,
  ) => void;
  onOpenPublication: (article: GeneratedContentArticle) => void;
  onOpenOrder?: () => void;
}

function stageTone(
  stage?: ArticleWorkflowStage,
): "neutral" | "info" | "success" | "warning" | "danger" {
  if (stage === "published") return "success";
  if (stage === "needs_completion") return "warning";
  if (stage === "queued" || stage === "submitting") return "info";
  return "neutral";
}

export default function GeneratedArticlesList({
  groups,
  visibleError,
  clientId,
  collapsed,
  selected,
  workflowByArticle,
  publishedArchives,
  publishedView,
  isArticleSelectable,
  isArticleSubmittable,
  onToggleCollapsed,
  onToggleGroup,
  onToggleArticle,
  onOpenArticle,
  onOpenPublication,
  onOpenOrder,
}: GeneratedArticlesListProps) {
  const publishedTimeFacts = React.useMemo(
    () => publishedTimeFactsByArticle(publishedArchives),
    [publishedArchives],
  );

  return (
    <div className="grid w-full min-w-0 gap-2.5">
      {groups.map((group) => {
        const groupSelectable = selectableArticles(
          group.articles,
          clientId,
        ).filter(isArticleSelectable);
        const groupSubmittable = selectableArticles(
          group.articles,
          clientId,
        ).filter(isArticleSubmittable);
        const groupSelection = selectionState(
          groupSelectable,
          selected,
          clientId,
        );
        const isCollapsed = collapsed[group.key] !== false;
        const groupPublishedTime = publishedView
          ? publishedTimeFacts.get(group.articles[0]?.id) || null
          : null;
        const groupLatestTime = publishedView
          ? groupPublishedTime
            ? `${groupPublishedTime.label} ${formatBeijingTime(groupPublishedTime.firstPublishedAt)}`
            : "发布时间未记录"
          : formatBeijingTime(group.articles[0]?.createdAt);

        return (
          <section
            key={group.key}
            className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)]"
          >
            <div className="flex w-full min-w-0 items-center gap-3 border-b border-slate-100 bg-slate-50/65 px-3.5 py-2.5">
              <input
                type="checkbox"
                aria-label={`全选 ${group.label}`}
                checked={groupSelection.checked}
                ref={(element) => {
                  if (element) element.indeterminate = groupSelection.indeterminate;
                }}
                onChange={() => onToggleGroup(group.articles)}
                disabled={groupSelection.disabled}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
              />
              <button
                type="button"
                onClick={() => onToggleCollapsed(group.key)}
                className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-slate-800 group-hover:text-blue-700">
                    {group.displayTitle || `${group.platform} · ${group.label}`}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {group.articles.length} 篇 · 可投稿 {groupSubmittable.length} · 最新 {groupLatestTime}
                    {group.templateSnapshot?.scenario
                      ? ` · 场景：${group.templateSnapshot.scenario}`
                      : ""}
                  </span>
                </span>
              </button>
            </div>

            {!isCollapsed && (
              <div className="min-w-0 divide-y divide-slate-100">
                {group.articles.map((article) => {
                  const workflow = workflowByArticle.get(article.id);
                  const stageLabel = workflow?.label || "状态不可用";
                  const summary = workflow?.publicationSummary;
                  const summaryLabel = summary
                    ? summary.label || publicationStatusLabel(summary.status)
                    : "状态不可用";
                  const publishedTime =
                    workflow?.stage === "published"
                      ? publishedTimeFacts.get(article.id) || null
                      : null;
                  const articleTime =
                    workflow?.stage === "published"
                      ? publishedTime
                        ? `${publishedTime.label} ${formatBeijingTime(publishedTime.firstPublishedAt)}`
                        : "发布时间未记录"
                      : formatBeijingTime(article.createdAt);
                  const opensOrder =
                    workflow?.orderSummary?.status === "processing" &&
                    Boolean(onOpenOrder);

                  return (
                    <div
                      key={article.id}
                      className="grid w-full min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-slate-50/70"
                    >
                      <input
                        type="checkbox"
                        aria-label={`选择 ${article.title}`}
                        checked={selected.includes(articleSelectionKey(article))}
                        onChange={() => onToggleArticle(article)}
                        disabled={!isArticleSelectable(article)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-600"
                      />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 overflow-hidden">
                        <button
                          type="button"
                          disabled={!workflow}
                          aria-disabled={!workflow}
                          title={
                            !workflow
                              ? "文章流程状态不可用，暂不能打开编辑器"
                              : undefined
                          }
                          onClick={(event) => {
                            if (!workflow) return;
                            onOpenArticle(
                              article,
                              event.currentTarget,
                              workflow.stage === "published",
                            );
                          }}
                          className="block w-full min-w-0 overflow-hidden text-left disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="block truncate text-[13px] font-semibold text-slate-800 hover:text-blue-700">
                            {article.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                            {group.articleAnnotations?.[article.id]
                              ? `${group.articleAnnotations[article.id]} · `
                              : ""}
                            {articleTime} · 投稿记录：{summaryLabel}
                          </span>
                        </button>
                      </div>
                      <StatusBadge tone={stageTone(workflow?.stage)}>
                        {stageLabel}
                      </StatusBadge>
                      <button
                        type="button"
                        onClick={() =>
                          opensOrder && onOpenOrder
                            ? onOpenOrder()
                            : onOpenPublication(article)
                        }
                        className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {opensOrder ? "查看订单" : "发布详情"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      {!groups.length && !visibleError && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-10 text-center text-sm text-slate-400">
          暂无文章
        </div>
      )}
    </div>
  );
}
