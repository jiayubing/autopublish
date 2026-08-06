import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import type { PaidMediaPreflight } from '../../types/publication';

interface PaidMediaPreflightDialogProps {
  model: PaidMediaPreflight;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function PaidMediaPreflightDialog({ model, busy, error, onClose, onConfirm }: PaidMediaPreflightDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const confirm = async () => {
    if (!model.canConfirm || busy) return;
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="paid-media-preflight-title" tabIndex={-1} className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/70 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <h2 id="paid-media-preflight-title" className="text-base font-semibold text-slate-800">付费媒体费用确认</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">预检令牌仅对应当前文章集合和一个媒体资源，确认前服务端会再次复核资源和文章。</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭付费媒体预检" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-sm text-slate-700">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500">媒体资源</div><div className="mt-1 font-semibold">{model.mediaName || model.mediaResourceId}</div><div className="mt-1 text-xs text-slate-500">{model.mediaResourceId}</div></div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500">媒体备注</div><div className="mt-1 whitespace-pre-wrap text-xs leading-5">{model.mediaRemarks || '无'}</div></div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500">文章数</div><div className="mt-1 font-semibold">{model.articleCount} 篇</div></div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500">最新单价 / 预计费用</div><div className="mt-1 font-semibold">{model.quotedPrice === null ? '报价无效' : `¥${model.quotedPrice.toFixed(2)}`} / {model.estimatedTotal === null ? '无法计算' : `¥${model.estimatedTotal.toFixed(2)}`}</div></div>
          </div>

          <div className="rounded border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800"><span className="font-semibold">系统投稿标识码：</span>{model.systemSubmissionCode || '未配置'}</div>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><CheckCircle2 className="h-4 w-4 text-emerald-500" />文章预检结果</h3>
            <div className="divide-y divide-slate-100 rounded border border-slate-200">
              {model.articles.map((article) => <div key={`${article.articleRef.clientId}:${article.articleId}`} className="flex items-start justify-between gap-3 p-3 text-xs"><div className="min-w-0"><div className="truncate font-semibold">{article.title || article.articleId}</div><div className="mt-1 text-slate-500">{article.articleRef.clientId} · {article.articleId}</div></div><span className={article.status === 'ready' ? 'shrink-0 text-emerald-700' : 'shrink-0 text-rose-700'}>{article.status === 'ready' ? '可确认' : `阻断：${article.reasonCodes.join('、') || '状态不允许'}`}</span></div>)}
            </div>
          </section>

          {model.risks.length > 0 && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" />内容风险提示（仅提示，不修改正文）</div>{model.risks.map((risk) => <div key={risk.code}>{risk.message} · {risk.count} 处</div>)}</div>}
          {model.blockers.length > 0 && <div role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{model.blockers.map((blocker) => <div key={blocker}>{blocker}</div>)}</div>}
          {error && <div role="alert" className="text-xs text-rose-600">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 p-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-40">取消</button>
          <button type="button" onClick={() => void confirm()} disabled={busy || model.canConfirm !== true} className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}确认付费投稿</button>
        </div>
      </div>
    </div>
  );
}
