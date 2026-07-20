import React, { useEffect, useRef, useState } from 'react';
import { previewArticleAttention, resolveArticleAttention } from '../../bridge/content';
import type { ArticleAttentionItem } from '../../types';
import type { ArticleAttentionSnapshot } from '../../article-attention-store';

function labelFor(item: ArticleAttentionItem): string {
  if (item.kind === 'missing_pair_finalize') return '队列文件已不存在，可安全完成记录收尾';
  if (item.kind === 'removal_needs_repair') return '删除事务需要修复';
  if (item.kind === 'publication_uncertain') return '远端结果待确认';
  if (item.kind === 'published_archive_failed') return '远端成功，本地归档待处理';
  if (item.kind === 'failed_submission') return '投稿明确失败';
  return '队列文件与原记录不一致';
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    finalize: '安全完成', cleanup: '清理旧队列', 'retry-removal': '重试修复删除', 'retry-publication': '重新投稿',
    'open-publication': '打开发布详情', 'open-article': '打开文章', 'reconcile-published': '确认已发布',
    'reconcile-failed': '确认未发布', inspect: '查看差异', 'retry-archive': '重试本地归档'
  };
  return labels[action] || action;
}

function actionError(value: unknown): string {
  const error = value as { code?: unknown; message?: unknown };
  const labels: Record<string, string> = {
    ARTICLE_ATTENTION_STALE: '状态已变化，请刷新后重新检查。',
    ARTICLE_ATTENTION_ACTION_NOT_ALLOWED: '当前状态不允许这个动作。',
    ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE: '对应处理服务当前不可用。',
    CONTENT_SUBMISSION_TARGET_UNSUPPORTED: '当前平台不支持重新投稿。',
    ARTICLE_NOT_RETRYABLE: '只有内容完整且仍存在的文章可以重新投稿。'
  };
  if (typeof error.code === 'string' && labels[error.code]) return labels[error.code];
  return typeof error.message === 'string' ? error.message : '处理需处理项失败。';
}

interface ArticleAttentionPanelProps {
  snapshot: ArticleAttentionSnapshot;
  selectedAttentionId?: string | null;
  onRefresh: (reason?: string) => Promise<unknown>;
  onOpenPublication: (item: ArticleAttentionItem) => void;
  onInspect: (item: ArticleAttentionItem) => void;
  onOpenArticle: (item: ArticleAttentionItem) => void;
}

export default function ArticleAttentionPanel({ snapshot, selectedAttentionId, onRefresh, onOpenPublication, onInspect, onOpenArticle }: ArticleAttentionPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!selectedAttentionId) return;
    const element = itemRefs.current.get(selectedAttentionId);
    element?.scrollIntoView({ block: 'nearest' });
    element?.focus();
  }, [selectedAttentionId, snapshot.items]);

  async function resolve(item: ArticleAttentionItem, action: string) {
    if (action === 'open-publication') { onOpenPublication(item); return; }
    if (action === 'inspect') { onInspect(item); return; }
    if (action === 'open-article') { onOpenArticle(item); return; }
    setBusyId(item.attentionId); setError('');
    try {
      const preview = await previewArticleAttention({ attentionId: item.attentionId, action });
      if (preview.requiresConfirmation && !window.confirm(preview.message)) return;
      await resolveArticleAttention({ attentionId: item.attentionId, action, expectedRevision: preview.revision, confirmed: preview.requiresConfirmation ? true : undefined });
      await onRefresh('attention-resolved');
    } catch (value) { setError(actionError(value)); }
    finally { setBusyId(null); }
  }

  return <section aria-label="需处理中心" className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
    <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-amber-900">需处理中心</h3><p className="mt-1 text-xs text-amber-800">当前快照只展示有明确可执行动作的项目。</p></div><button type="button" onClick={() => void onRefresh('manual')} disabled={snapshot.loading} className="rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-800 disabled:opacity-40">{snapshot.loading ? '刷新中…' : '刷新'}</button></div>
    {error && <div role="alert" className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    {snapshot.error && !error && <div role="alert" className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{snapshot.error}</div>}
    <div className="mt-3 grid gap-2">{snapshot.items.map((item) => <div key={item.attentionId} ref={(node) => { if (node) itemRefs.current.set(item.attentionId, node); else itemRefs.current.delete(item.attentionId); }} tabIndex={selectedAttentionId === item.attentionId ? -1 : undefined} className={`rounded border bg-white p-2 outline-none ${selectedAttentionId === item.attentionId ? 'border-blue-400 ring-2 ring-blue-100' : 'border-amber-200'}`}>
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-800">{item.titleSnapshot || item.articleId || item.transactionId || '需处理项'}</div><div className="mt-1 text-xs text-slate-600">{labelFor(item)}{item.reasonCode ? ` · ${item.reasonCode}` : ''}</div></div><span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{item.status || '待处理'}</span></div>
      <div className="mt-2 flex flex-wrap gap-1.5">{item.allowedActions.map((action) => <button key={action} type="button" disabled={busyId === item.attentionId} onClick={() => void resolve(item, action)} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-40">{actionLabel(action)}</button>)}</div>
    </div>)}{!snapshot.items.length && !snapshot.loading && !snapshot.error && <div className="rounded border border-dashed border-amber-300 bg-white p-4 text-center text-xs text-amber-800">当前没有需处理项</div>}</div>
  </section>;
}
