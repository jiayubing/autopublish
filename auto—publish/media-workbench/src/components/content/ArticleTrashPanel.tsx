import React from 'react';
import type { ArticleTrashRecord } from '../../types/publication';
import { formatBeijingTime } from '../../time-format';

interface ArticleTrashPanelProps {
  trash: ArticleTrashRecord[];
  visibleError: string;
  commandBusy: (...names: string[]) => boolean;
  onBack: () => void;
  onRestore: (entry: ArticleTrashRecord) => void;
  onPermanentlyDelete: (entry: ArticleTrashRecord) => void;
}

function trashPublicationSummary(entry: ArticleTrashRecord): string {
  const summary = entry.publicationSummary;
  if (!summary || typeof summary !== 'object') return '发布详情保留在发布账本中';
  const value = summary as { label?: unknown; status?: unknown; records?: unknown; published?: unknown };
  const label = typeof value.label === 'string' ? value.label : typeof value.status === 'string' ? value.status : '已保留';
  const records = typeof value.records === 'number' ? ` · ${value.records} 条记录` : '';
  const published = typeof value.published === 'number' ? ` · 已发布 ${value.published}` : '';
  return `${label}${records}${published}`;
}

export default function ArticleTrashPanel({ trash, visibleError, commandBusy, onBack, onRestore, onPermanentlyDelete }: ArticleTrashPanelProps) {
  return <div className="relative h-full w-full min-w-0 overflow-y-auto p-4">
    <div className="mb-4 flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-slate-800">文章回收站</h2><p className="mt-1 text-xs text-slate-500">回收站只保留标题快照、删除时间和发布记录摘要；正文恢复不会自动恢复投稿队列。</p></div><button type="button" onClick={onBack} className="rounded border border-slate-300 px-3 py-2 text-xs">返回文章管理</button></div>
    {visibleError && <div role="alert" className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{visibleError}</div>}
    <div className="grid gap-3">{trash.map((entry) => <div key={entry.articleId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3"><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold text-slate-800">{entry.titleSnapshot || `已删除文章 · ${entry.articleId.slice(-6)}`}</div><div className="mt-1 break-all text-xs text-slate-500">文章 ID：{entry.articleId} · {entry.status} · 删除于 {formatBeijingTime(entry.deletedAt)}</div><div className="mt-1 text-xs text-slate-600">只读发布详情：{trashPublicationSummary(entry)}</div>{entry.references?.length > 0 && <div className="mt-1 text-xs text-slate-400">关联记录：{entry.references.map((reference) => `${reference.type}/${reference.id}`).join('、')}</div>}</div><button type="button" disabled={commandBusy('restoreContentArticle')} onClick={() => onRestore(entry)} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">恢复（不恢复队列）</button><button type="button" disabled={commandBusy('preparePermanentDeleteContentArticle', 'permanentlyDeleteContentArticle')} onClick={() => onPermanentlyDelete(entry)} className="rounded bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">永久删除正文</button></div>)}{!trash.length && !visibleError && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">回收站为空</div>}</div>
  </div>;
}

