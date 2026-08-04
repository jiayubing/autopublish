import React from "react";
import {
  AlertCircle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
  Square,
  XCircle,
} from "lucide-react";
import {
  articleSelectionKey,
  PLATFORM_ORDER,
  type PlatformSelectionProps,
} from "./platform-workbench-model";

export default function PlatformQueuePanel({
  queue,
  platforms,
  loading,
  selectedArticles,
  collapsedGroups,
  isSelectableArticle,
  onReplaceArticles,
  onToggleArticle,
  onToggleGroupCollapse,
}: PlatformSelectionProps) {
  const groupedArticles: Record<string, typeof queue> = {};
  for (const article of queue) {
    const key = article.sourcePlatformId || article.platformId || "unknown";
    if (!groupedArticles[key]) groupedArticles[key] = [];
    groupedArticles[key].push(article);
  }

  const sortedGroups = PLATFORM_ORDER.filter((id) => groupedArticles[id]);

  const toggleSelectAllInGroup = (platformId: string) => {
    const groupArticles = groupedArticles[platformId] || [];
    const selectableGroup = groupArticles.filter(isSelectableArticle);
    if (!selectableGroup.length) return;
    const allSelected = selectableGroup.every((article) =>
      selectedArticles.has(articleSelectionKey(article)),
    );
    onReplaceArticles(
      allSelected
        ? [...selectedArticles].filter(
            (key) =>
              !selectableGroup.some(
                (article) => articleSelectionKey(article) === key,
              ),
          )
        : [
            ...new Set([
              ...selectedArticles,
              ...selectableGroup.map(articleSelectionKey),
            ]),
          ],
    );
  };

  return (
    <div className="lg:col-span-7 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-semibold text-slate-600 flex items-center space-x-1.5">
          <FileText className="w-4 h-4" />
          <span>待发布文章</span>
          <span className="text-xs font-normal text-slate-400 ml-1">
            ({queue.length})
          </span>
        </h3>
        {queue.length > 0 && (
          <button
            onClick={() => {
              const selectableQueue = queue.filter(isSelectableArticle);
              const allSelected =
                selectableQueue.length > 0 &&
                selectableQueue.every((article) =>
                  selectedArticles.has(articleSelectionKey(article)),
                );
              onReplaceArticles(
                allSelected ? [] : selectableQueue.map(articleSelectionKey),
              );
            }}
            className="text-xs text-blue-500 hover:text-blue-700 font-medium"
          >
            {queue.filter(isSelectableArticle).length > 0 &&
            queue
              .filter(isSelectableArticle)
              .every((article) =>
                selectedArticles.has(articleSelectionKey(article)),
              )
              ? "取消全选"
              : "全选"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">加载队列中...</span>
          </div>
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <FileText className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-sm">暂无待发布文章</span>
            <span className="text-xs mt-1">
              请在 input/lieju、input/toutiao 或 input/hepan 目录中添加文章
            </span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedGroups.map((platformId) => {
              const groupArticles = groupedArticles[platformId];
              const isCollapsed = collapsedGroups.has(platformId);
              const selectableGroup = groupArticles.filter(isSelectableArticle);
              const allInGroupSelected =
                selectableGroup.length > 0 &&
                selectableGroup.every((article) =>
                  selectedArticles.has(articleSelectionKey(article)),
                );
              const someInGroupSelected = selectableGroup.some((article) =>
                selectedArticles.has(articleSelectionKey(article)),
              );
              const displayName =
                platforms.find((platform) => platform.id === platformId)
                  ?.displayName || platformId;

              return (
                <div key={platformId}>
                  <button
                    onClick={() => onToggleGroupCollapse(platformId)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSelectAllInGroup(platformId);
                        }}
                        className="p-0.5"
                      >
                        {allInGroupSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-500" />
                        ) : someInGroupSelected ? (
                          <div className="w-4 h-4 rounded border-2 border-blue-400 bg-blue-100 flex items-center justify-center">
                            <div className="w-2 h-0.5 bg-blue-500 rounded" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </button>
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="text-sm font-semibold text-slate-700">
                        {displayName}
                      </span>
                      <span className="text-xs text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-full">
                        {groupArticles.length}
                      </span>
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div>
                      {groupArticles.map((article) => (
                        <button
                          key={articleSelectionKey(article)}
                          onClick={() =>
                            onToggleArticle(articleSelectionKey(article))
                          }
                          disabled={!isSelectableArticle(article)}
                          title={
                            article.archiveErrorCode
                              ? "远端已发布，本地归档待处理，禁止再次远端投稿"
                              : article.sourceArticleState === "trashed"
                                ? `源文章已删除，禁止投稿${article.reasonCode ? `：${article.reasonCode}` : ""}`
                                : undefined
                          }
                          className={`w-full flex items-center space-x-2.5 px-3.5 py-2 transition-colors text-left ${
                            selectedArticles.has(articleSelectionKey(article))
                              ? "bg-blue-50/60"
                              : article.archiveErrorCode
                                ? "bg-amber-50/60"
                                : article.sourceArticleState === "trashed"
                                  ? "bg-rose-50/60"
                                  : "hover:bg-slate-50"
                          }`}
                        >
                          {article.archiveErrorCode ? (
                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                          ) : article.sourceArticleState === "trashed" ? (
                            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          ) : selectedArticles.has(
                              articleSelectionKey(article),
                            ) ? (
                            <CheckSquare className="w-4 h-4 text-blue-500 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {article.title || article.filename}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {article.archiveErrorCode
                                ? "远端已发布，本地归档待处理（禁止重投）"
                                : article.sourceArticleState === "trashed"
                                  ? `源文章已删除，禁止投稿${article.reasonCode ? ` · ${article.reasonCode}` : ""}`
                                  : article.filename}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
