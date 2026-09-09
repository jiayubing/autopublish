import React, { useState } from "react";
import type { MediaResource, MediaType } from "../types/media";
import {
  BookmarkMinus,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Music as MusicIcon,
  RefreshCw,
  Search,
  Sparkles,
  Video as VideoIcon,
} from "lucide-react";
import { Button } from "./ui/primitives";

interface ResourceLibraryProps {
  resources: MediaResource[];
  selectedResourceIds: string[];
  poolResourceIds: string[];
  mode: "management" | "picker";
  activeArticleLabel: string;
  onPickResource: (resource: MediaResource) => void;
  onTogglePool: (resource: MediaResource) => void;
  onRefreshResources?: () => void;
  isRefreshingResources?: boolean;
  totalResources?: number;
  resourcePage?: number;
  resourcePageSize?: number;
  resourceSearch?: string;
  onResourceSearch?: (query: string) => void;
  onResourcePageChange?: (page: number) => void;
  errorMessage?: string | null;
  statusMessage?: string | null;
}

const FILTERS: Array<{ id: MediaType | "all"; label: string }> = [
  { id: "all", label: "全部" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "document", label: "文档" },
];

export default function ResourceLibrary({
  resources,
  selectedResourceIds,
  poolResourceIds,
  mode,
  activeArticleLabel,
  onPickResource,
  onTogglePool,
  onRefreshResources,
  isRefreshingResources,
  totalResources,
  resourcePage,
  resourcePageSize,
  resourceSearch,
  onResourceSearch,
  onResourcePageChange,
  errorMessage,
  statusMessage,
}: ResourceLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<MediaType | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const usesRemotePaging = typeof onResourcePageChange === "function";
  const usesRemoteSearch = typeof onResourceSearch === "function";

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      usesRemoteSearch ||
      resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.resourceId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === "all" || resource.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const totalPages = usesRemotePaging
    ? Math.max(1, Math.ceil((totalResources || 0) / (resourcePageSize || 50)))
    : Math.ceil(filteredResources.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const visiblePage = usesRemotePaging ? resourcePage || 1 : currentPage;
  const paginatedResources = usesRemotePaging
    ? filteredResources
    : filteredResources.slice(startIndex, startIndex + itemsPerPage);

  function mediaIcon(type: MediaType) {
    switch (type) {
      case "image":
        return <ImageIcon className="h-4 w-4 text-emerald-500" />;
      case "video":
        return <VideoIcon className="h-4 w-4 text-blue-500" />;
      case "audio":
        return <MusicIcon className="h-4 w-4 text-violet-500" />;
      default:
        return <FileText className="h-4 w-4 text-amber-500" />;
    }
  }

  return (
    <div
      id="mediaResourceLibraryRoot"
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${
        mode === "management" ? "h-full" : "sticky top-6 h-full"
      }`}
    >
      <div className="border-b border-slate-100 px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {mode === "management" ? "资源目录" : "选择媒体资源"}
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
              {mode === "picker"
                ? `正在为“${activeArticleLabel}”挑选媒体，点击资源即可绑定或解除。`
                : "资源池只影响媒体挑选范围；刷新资源不会创建订单或投稿。"}
            </p>
          </div>
          {mode === "management" && onRefreshResources && (
            <Button
              size="sm"
              onClick={onRefreshResources}
              disabled={isRefreshingResources}
              title="从服务器拉取全部资源（较慢）"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isRefreshingResources ? "animate-spin" : ""
                }`}
              />
              {isRefreshingResources ? "拉取中…" : "刷新库"}
            </Button>
          )}
        </div>

        {mode === "picker" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/65 px-3 py-2 text-[11px] leading-5 text-blue-800">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
            资源选择只更新当前挑选会话，不会自动发起投稿。
          </div>
        )}
      </div>

      <div className="grid gap-2 border-b border-slate-100 bg-slate-50/55 px-4 py-3">
        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            {errorMessage}
          </div>
        )}
        {!errorMessage && statusMessage && (
          <div
            role="status"
            className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
          >
            {statusMessage}
          </div>
        )}

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索资源名称、编码…"
              value={usesRemoteSearch ? resourceSearch || "" : searchQuery}
              onChange={(event) => {
                if (usesRemoteSearch) onResourceSearch(event.target.value);
                else {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }
              }}
              className="media-search ui-field h-9 pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((filter) => {
              const active = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    setActiveFilter(filter.id);
                    setCurrentPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    active
                      ? "bg-slate-800 text-white"
                      : "text-slate-500 hover:bg-white hover:text-slate-800"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="resource-list min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {paginatedResources.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-slate-400">
            <HelpCircle className="h-5 w-5 text-slate-300" />
            暂无匹配的资源
          </div>
        ) : (
          paginatedResources.map((resource) => {
            const isSelected = selectedResourceIds.includes(resource.resourceId);
            const inPool = poolResourceIds.includes(resource.resourceId);
            return (
              <div
                key={resource.resourceId}
                onClick={() => onPickResource(resource)}
                className={`group flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 ${
                  mode === "picker" ? "cursor-pointer" : ""
                } ${isSelected && mode === "picker" ? "bg-blue-50/45" : ""}`}
              >
                {mode === "picker" ? (
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                    {mediaIcon(resource.type)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-[13px] font-semibold text-slate-700">
                    {resource.name}
                  </h4>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                    <span className="max-w-52 truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                      {resource.resourceId}
                    </span>
                    <span>{resource.size}</span>
                    <span className="font-semibold text-slate-500">
                      {typeof resource.price === "number"
                        ? `¥${resource.price.toFixed(1)}`
                        : "价格未记录"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePool(resource);
                  }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    inPool
                      ? "border-amber-200 bg-amber-50 text-amber-600"
                      : "border-transparent text-slate-300 hover:border-amber-100 hover:bg-amber-50 hover:text-amber-500"
                  }`}
                  title={inPool ? "移出资源池" : "加入资源池"}
                  aria-label={inPool ? `移出资源池 ${resource.name}` : `加入资源池 ${resource.name}`}
                >
                  {inPool ? (
                    <BookmarkMinus className="h-3.5 w-3.5" />
                  ) : (
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[11px]">
          <span className="page-info text-slate-500">
            第 <b>{visiblePage}</b> / <b>{totalPages}</b> 页 (共 {usesRemotePaging ? totalResources || 0 : filteredResources.length} 项)
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label="资源上一页"
              disabled={visiblePage === 1}
              onClick={() =>
                usesRemotePaging
                  ? onResourcePageChange?.(Math.max(visiblePage - 1, 1))
                  : setCurrentPage((previous) => Math.max(previous - 1, 1))
              }
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="资源下一页"
              disabled={visiblePage === totalPages}
              onClick={() =>
                usesRemotePaging
                  ? onResourcePageChange?.(
                      Math.min(visiblePage + 1, totalPages),
                    )
                  : setCurrentPage((previous) =>
                      Math.min(previous + 1, totalPages),
                    )
              }
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
