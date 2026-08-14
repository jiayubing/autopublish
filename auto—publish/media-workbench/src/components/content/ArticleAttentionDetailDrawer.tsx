import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ArticleAttentionItem } from '../../types/publication';

interface ArticleAttentionDetailDrawerProps {
  item: ArticleAttentionItem | null;
  onClose: () => void;
  onResolveAttentionAction?: (
    item: ArticleAttentionItem,
    action: string,
    orderId?: string,
  ) => Promise<unknown>;
  resolutionBusy?: boolean;
  resolutionError?: string | null;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    'open-submission': '打开发起投稿',
    'open-publication': '打开发布详情',
    'open-article': '打开文章',
    inspect: '查看差异',
    'bind-paid-order-number': '补录订单号',
    'confirm-paid-order-absent': '确认没有订单',
    'resume-order-tracking': '恢复订单跟踪',
    'confirm-order-published': '确认已发布',
    'confirm-order-not-published': '确认未发布',
  };
  return labels[action] || action;
}

export default function ArticleAttentionDetailDrawer({ item, onClose, onResolveAttentionAction, resolutionBusy = false, resolutionError = null }: ArticleAttentionDetailDrawerProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [orderId, setOrderId] = useState('');
  useEffect(() => { if (item) headingRef.current?.focus(); }, [item]);
  useEffect(() => { setOrderId(''); }, [item?.attentionId]);
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
        {item.orderCreationAttemptId && item.allowedActions.includes('bind-paid-order-number') && <div className="grid gap-2 rounded border border-blue-200 bg-blue-50 p-3">
          <label className="font-semibold text-blue-900" htmlFor="paid-order-resolution-id">补录服务商订单号</label>
          <input id="paid-order-resolution-id" value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={resolutionBusy} placeholder="输入已在服务商处核对的订单号" className="min-w-0 rounded border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 disabled:opacity-50" />
          <button type="button" disabled={resolutionBusy || !orderId.trim() || !onResolveAttentionAction} onClick={() => void onResolveAttentionAction?.(item, 'bind-paid-order-number', orderId.trim())} className="w-full rounded bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-50 sm:w-auto">{resolutionBusy ? '正在核对…' : '核对并补录'}</button>
        </div>}
        {item.orderCreationAttemptId && item.allowedActions.includes('confirm-paid-order-absent') && <button type="button" disabled={resolutionBusy || !onResolveAttentionAction} onClick={() => void onResolveAttentionAction?.(item, 'confirm-paid-order-absent')} className="w-full rounded border border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-900 disabled:opacity-50 sm:w-auto">确认服务商没有该订单</button>}
        {resolutionError && <div role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-rose-700">{resolutionError}</div>}
        {item.allowedActions.length > 0 && <div><div className="font-semibold text-slate-700">当前允许动作</div><div className="mt-2 flex flex-wrap gap-1.5">{item.allowedActions.map((action) => <span key={action} className="rounded bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">{actionLabel(action)}</span>)}</div></div>}
      </div>
    </aside>
  </div>;
}
