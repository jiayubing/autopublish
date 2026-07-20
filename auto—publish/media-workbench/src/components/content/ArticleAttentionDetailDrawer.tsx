import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ArticleAttentionItem } from '../../types';

interface ArticleAttentionDetailDrawerProps {
  item: ArticleAttentionItem | null;
  onClose: () => void;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    cleanup: '清理旧队列',
    'retry-publication': '重新投稿',
    'open-publication': '打开发布详情',
    'open-article': '打开文章',
    inspect: '查看差异',
    finalize: '安全完成',
  };
  return labels[action] || action;
}

export default function ArticleAttentionDetailDrawer({ item, onClose }: ArticleAttentionDetailDrawerProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { if (item) headingRef.current?.focus(); }, [item]);
  if (!item) return null;
  return <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label="需处理详情">
    <button type="button" aria-label="关闭需处理详情" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/20" />
    <aside className="relative flex h-full w-full max-w-md min-w-0 flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-start gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0 flex-1"><h3 ref={headingRef} tabIndex={-1} className="break-words text-base font-semibold text-slate-800">需处理详情</h3><p className="mt-1 break-words text-xs text-slate-500">{item.titleSnapshot || item.articleId || '未命名记录'}</p></div>
        <button type="button" aria-label="关闭需处理详情" onClick={onClose} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 p-4 text-xs text-slate-700">
        <div className="rounded border border-amber-200 bg-amber-50 p-3 leading-5 text-amber-900">{item.message || '当前状态需要进一步处理。'}</div>
        <dl className="grid gap-2">
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"><dt className="text-slate-400">状态</dt><dd className="break-words">{item.status || '未知'}</dd></div>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"><dt className="text-slate-400">平台</dt><dd className="break-words">{item.displayName || item.platformId || '未知'}</dd></div>
          {item.reasonCode && <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"><dt className="text-slate-400">原因码</dt><dd className="break-all font-mono">{item.reasonCode}</dd></div>}
          {item.pairState && <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"><dt className="text-slate-400">队列配对</dt><dd className="break-words">{item.pairState}</dd></div>}
          {item.updatedAt && <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"><dt className="text-slate-400">最近更新</dt><dd className="break-words">{item.updatedAt}</dd></div>}
        </dl>
        <div className="rounded border border-slate-200 bg-slate-50 p-3 leading-5 text-slate-600">此详情不显示工作区绝对路径、正文、Cookie、完整哈希或远端完整响应。</div>
        {item.allowedActions.length > 0 && <div><div className="font-semibold text-slate-700">当前允许动作</div><div className="mt-2 flex flex-wrap gap-1.5">{item.allowedActions.map((action) => <span key={action} className="rounded bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">{actionLabel(action)}</span>)}</div></div>}
      </div>
    </aside>
  </div>;
}
