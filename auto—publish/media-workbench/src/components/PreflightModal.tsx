import React from 'react';
import { Article } from '../types';
import { AlertTriangle, CheckCircle2, DollarSign, Loader2, ShieldCheck, X } from 'lucide-react';
import { motion } from 'motion/react';

interface ResourcePreflightItem {
  filename: string;
  title?: string;
  resourceId: string;
  resourceName?: string;
  price: number;
  status?: string;
  reasonCode?: string;
  publicationId?: string;
}

export interface MediaPreflightSummary {
  blockers?: string[];
  blockedResources?: ResourcePreflightItem[];
  submitableResources?: ResourcePreflightItem[];
  queueableResources?: ResourcePreflightItem[];
  estimatedTotalPrice?: number;
  actualPrice?: number;
  blockedResourceCount?: number;
  submitableResourceCount?: number;
}

interface PreflightModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[];
  balance: number;
  summary: MediaPreflightSummary;
  isSubmitting: boolean;
  onSubmit: () => Promise<void>;
}

function statusText(item: ResourcePreflightItem) {
  if (item.status === 'uncertain') return '待确认，禁止重试';
  if (item.status === 'published') return '已发布，禁止重复';
  if (item.status === 'submitted') return '已提交，等待订单同步';
  return '已有发布记录，禁止重复';
}

export default function PreflightModal({
  isOpen,
  onClose,
  articles,
  balance,
  summary,
  isSubmitting,
  onSubmit
}: PreflightModalProps) {
  if (!isOpen) return null;

  const blocked = summary.blockedResources || [];
  const submitable = summary.submitableResources || summary.queueableResources || [];
  const actualPrice = Number(summary.actualPrice ?? summary.estimatedTotalPrice ?? 0);
  const blockers = summary.blockers || [];
  const canSubmit = !isSubmitting && blockers.length === 0 && submitable.length > 0 && balance >= actualPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-800">付费媒体资源级预检</h2>
              <p className="text-xs text-slate-400 mt-0.5">每个文章 × resourceId 独立判断发布记录和订单</p>
            </div>
          </div>
          {!isSubmitting && <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>待处理稿件 {articles.length} 篇，选中目标 {blocked.length + submitable.length} 个</span>
            <span className="font-semibold text-slate-700">可提交 {submitable.length} 个</span>
          </div>

          {blockers.length > 0 && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs space-y-1">
              {blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" />可提交资源（计入价格）</h3>
            {submitable.length === 0 ? (
              <p className="p-3 rounded-lg bg-slate-50 text-xs text-slate-400">没有可提交资源。</p>
            ) : (
              <div className="border border-emerald-100 rounded-xl divide-y divide-slate-100">
                {submitable.map((item) => (
                  <div key={`${item.filename}:${item.resourceId}`} className="px-3 py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0"><p className="font-semibold text-slate-700 truncate">{item.title || item.filename}</p><p className="text-[10px] text-slate-400">{item.resourceName || '媒体资源'} · {item.resourceId}</p></div>
                    <span className="font-mono font-bold text-emerald-700">¥{Number(item.price || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" />阻止资源（不计入价格）</h3>
            {blocked.length === 0 ? (
              <p className="p-3 rounded-lg bg-slate-50 text-xs text-slate-400">没有已阻止资源。</p>
            ) : (
              <div className="border border-amber-100 rounded-xl divide-y divide-slate-100">
                {blocked.map((item) => (
                  <div key={`${item.filename}:${item.resourceId}`} className="px-3 py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0"><p className="font-semibold text-slate-700 truncate">{item.title || item.filename}</p><p className="text-[10px] text-amber-700">{item.resourceName || '媒体资源'} · {item.resourceId} · {statusText(item)}</p></div>
                    <span className="font-mono text-slate-400 line-through">¥{Number(item.price || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-blue-600" /><span className="text-xs text-slate-500">实际预计扣费（仅可提交资源）</span></div>
            <span className="font-mono text-lg font-bold text-blue-700">¥{actualPrice.toFixed(2)}</span>
          </div>
          {balance < actualPrice && <p className="text-xs text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />余额不足，无法提交可提交资源。</p>}
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex justify-end gap-2">
          <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-50">取消</button>
          <button onClick={onSubmit} disabled={!canSubmit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold rounded-lg flex items-center gap-1.5">
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSubmitting ? '提交中...' : `确认提交 ${submitable.length} 个资源`}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
