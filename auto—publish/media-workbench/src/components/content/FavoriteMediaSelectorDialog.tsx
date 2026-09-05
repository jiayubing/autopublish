import React from "react";
import type { MediaResource } from "../../types/media";
import type { FavoriteMediaPage } from "./GeneratedArticlesView.types";

export default function FavoriteMediaSelectorDialog({
  page,
  onPageChange,
  onSelect,
  onClose,
}: {
  page: FavoriteMediaPage;
  onPageChange: (page: number) => void;
  onSelect: (resource: MediaResource) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="选择收藏媒体"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800">选择收藏媒体</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              仅显示媒体资源页中已收藏的媒体；缓存价格仅供参考，实际创建订单前会复核价格和接单状态。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭收藏媒体选择"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {page.loading ? (
            <p role="status" className="text-sm text-slate-500">正在加载收藏媒体…</p>
          ) : page.errorMessage ? (
            <p role="alert" className="rounded border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
              {page.errorMessage}
            </p>
          ) : page.total === 0 ? (
            <div className="rounded border border-dashed border-slate-300 p-5 text-center">
              <p className="text-sm font-medium text-slate-700">还没有收藏媒体</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                请先前往“媒体资源”页面收藏常用媒体，再回来发起付费投稿。
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {page.items.map((resource) => (
                <div
                  key={resource.resourceId}
                  className="flex min-w-0 items-center justify-between gap-3 rounded border border-slate-200 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{resource.name || resource.resourceId}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">资源码：{resource.resourceId}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {typeof resource.price === "number"
                        ? `缓存参考价：¥${resource.price.toFixed(2)}`
                        : "暂无缓存参考价"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`选择收藏媒体 ${resource.name || resource.resourceId}`}
                    onClick={() => onSelect(resource)}
                    className="shrink-0 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    选择
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 text-xs text-slate-500">
          <span>
            已收藏 {page.total} 个
            {page.totalPages > 0 ? ` · 第 ${page.page}/${page.totalPages} 页` : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page.page - 1)}
              disabled={!page.hasPrev || page.loading}
              className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page.page + 1)}
              disabled={!page.hasNext || page.loading}
              className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

