import React, { useCallback, useEffect, useState } from 'react';
import { getArticleAttention, listArticleAttention, previewArticleAttention, resolveArticleAttention } from '../../electron-api';
import type { ArticleAttentionItem } from '../../types';

function labelFor(item: ArticleAttentionItem): string {
  if (item.kind === 'missing_pair_finalize') return '队列文件已不存在，可安全完成记录收尾';
  if (item.kind === 'removal_needs_repair') return '删除事务需要修复';
  if (item.kind === 'publication_uncertain') return '远端结果待确认';
  if (item.kind === 'published_archive_failed') return '远端成功，本地归档待处理';
  if (item.kind === 'failed_submission') return '投稿明确失败';
  return '队列文件与原记录不一致';
}

export default function ArticleAttentionPanel({ clientId, selectedAttentionId, onOpenPublication }: { clientId?: string; selectedAttentionId?: string | null; onOpenPublication?: (item: ArticleAttentionItem) => void }) {
  const [items, setItems] = useState<ArticleAttentionItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems(await listArticleAttention(clientId)); setError(''); }
    catch (value) { setError(value instanceof Error ? value.message : '无法加载需处理项'); }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function resolve(item: ArticleAttentionItem, action: string) {
    if (action === 'open-publication' || action === 'inspect') { onOpenPublication?.(item); return; }
    setBusyId(item.attentionId); setError('');
    try {
      const current = await getArticleAttention(item.attentionId);
      if (!current) throw new Error('需处理项已完成');
      const preview = await previewArticleAttention({ attentionId: item.attentionId, action });
      if (preview.requiresConfirmation && !window.confirm(`${preview.message}。确认执行？`)) return;
      await resolveArticleAttention({ attentionId: item.attentionId, action, expectedRevision: preview.revision, confirmed: preview.requiresConfirmation ? true : undefined });
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : '处理需处理项失败'); }
    finally { setBusyId(null); }
  }

  return <section aria-label="需处理中心" className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
    <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-amber-900">需处理中心</h3><p className="mt-1 text-xs text-amber-800">每一项都有明确说明和安全动作；不会要求你直接编辑工作区文件。</p></div><button type="button" onClick={() => void load()} className="rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-800">刷新</button></div>
    {error && <div role="alert" className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="mt-3 grid gap-2">{items.map((item) => <div key={item.attentionId} className={`rounded border bg-white p-2 ${selectedAttentionId === item.attentionId ? 'border-blue-400' : 'border-amber-200'}`}>
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-800">{item.titleSnapshot || item.articleId || item.transactionId || '需处理项'}</div><div className="mt-1 text-xs text-slate-600">{labelFor(item)}{item.reasonCode ? ` · ${item.reasonCode}` : ''}</div></div><span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{item.status || '待处理'}</span></div>
      <div className="mt-2 flex flex-wrap gap-1.5">{item.allowedActions.map((action) => <button key={action} type="button" disabled={busyId === item.attentionId} onClick={() => void resolve(item, action)} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-40">{action === 'finalize' ? '安全完成' : action === 'cleanup' ? '清理旧队列' : action === 'retry' ? '重试修复' : action === 'open-publication' ? '打开发布详情' : action === 'reconcile-published' ? '确认已发布' : action === 'reconcile-failed' ? '确认未发布' : action === 'inspect' ? '查看差异' : action}</button>)}</div>
    </div>)}{!items.length && !error && <div className="rounded border border-dashed border-amber-300 bg-white p-4 text-center text-xs text-amber-800">当前没有需处理项</div>}</div>
  </section>;
}
