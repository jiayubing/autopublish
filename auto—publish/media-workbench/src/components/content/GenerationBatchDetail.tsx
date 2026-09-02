import React, { useState } from 'react';
import { Ban, Pause, Play, RotateCcw } from 'lucide-react';
import type { GenerationBatch, GenerationBatchState } from '../../types/generation';
import { useConfirmation } from '../../confirmation';

interface GenerationBatchDetailProps {
  batch: GenerationBatch;
  state: GenerationBatchState;
  busy: {
    pause: boolean;
    resume: boolean;
    abandon: boolean;
    retry: boolean;
  };
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
  onRetry: () => void;
  onPreviewCancelPending: (input: { batchId: string }) => Promise<{ canCancel: boolean; pendingCount: number; runningCount: number }>;
  onCancelPending: (input: { batchId: string; confirmed: true }) => Promise<GenerationBatch>;
  onStartNew?: () => void;
  onViewBatchArticles?: (batchId: string, clientId?: string) => void;
}

export default function GenerationBatchDetail({ batch, state, busy, onPause, onResume, onAbandon, onRetry, onPreviewCancelPending, onCancelPending, onStartNew, onViewBatchArticles }: GenerationBatchDetailProps) {
  const { confirm } = useConfirmation();
  const [cancelledBatch, setCancelledBatch] = useState<GenerationBatch | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const displayedBatch = cancelledBatch?.id === batch.id ? cancelledBatch : batch;
  const runtimeStateMatches = state.batchId === batch.id && Boolean(state.status) && state.status !== 'idle';
  const counts = { total: displayedBatch.tasks.length, succeeded: 0, failed: 0, pending: 0, interrupted: 0, cancelled: 0, ...(displayedBatch.counts || {}), ...(runtimeStateMatches ? (state.counts || {}) : {}) };
  const effectiveStatus = runtimeStateMatches ? state.status as string : displayedBatch.status;
  const active = effectiveStatus === 'running' || effectiveStatus === 'pausing';
  const running = effectiveStatus === 'running';
  const unfinished = counts.pending > 0 || counts.failed > 0 || counts.interrupted > 0;
  const showCostWarning = active || (['paused', 'abandoned'].includes(batch.status) && unfinished);
  const failed = counts.failed > 0;
  const terminal = effectiveStatus === 'completed' || effectiveStatus === 'abandoned';
  const anyCommandBusy = Object.values(busy).some(Boolean);
  async function cancelPending() {
    setCancelError('');
    setCancelBusy(true);
    try {
      const preview = await onPreviewCancelPending({ batchId: displayedBatch.id });
      if (!preview.canCancel || preview.pendingCount < 1) return;
      if (!(await confirm({ title: '永久取消待处理任务', message: `将永久取消 ${preview.pendingCount} 个待处理生成任务。正在运行的 ${preview.runningCount} 个任务会继续执行，已取消任务不会恢复或重试。`, confirmLabel: '永久取消', tone: 'danger' }))) return;
      const result = await onCancelPending({ batchId: displayedBatch.id, confirmed: true });
      setCancelledBatch(result);
    } catch (value) { setCancelError(value instanceof Error ? value.message : '取消待处理生成任务失败'); }
    finally { setCancelBusy(false); }
  }

  return <section className="generation-batch-detail mt-4 rounded-md border border-slate-200 bg-white p-4" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">批量生成进度</h2><p className="mt-1 text-xs text-slate-500">批次 {displayedBatch.id} · 状态 {effectiveStatus}</p></div><div className="flex gap-1"><button type="button" title="暂停批量生成" onClick={onPause} disabled={busy.pause || !running} className="task-icon-button"><Pause className="h-4 w-4" /></button><button type="button" title="继续批量生成" onClick={onResume} disabled={busy.resume || active || !unfinished} className="task-icon-button"><Play className="h-4 w-4" /></button><button type="button" title="结束当前批次" onClick={onAbandon} disabled={busy.abandon || anyCommandBusy || active || !unfinished} className="task-icon-button">结束</button><button type="button" title="重试失败任务" onClick={onRetry} disabled={busy.retry || active || !failed} className="task-icon-button"><RotateCcw className="h-4 w-4" /></button><button type="button" title="永久取消待处理任务" onClick={() => void cancelPending()} disabled={anyCommandBusy || cancelBusy || counts.pending < 1} className="task-icon-button"><Ban className="h-4 w-4" /></button></div></div>
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-6"><span className="rounded bg-slate-50 p-2">总任务 {counts.total}</span><span className="rounded bg-emerald-50 p-2 text-emerald-700">成功 {counts.succeeded}</span><span className="rounded bg-rose-50 p-2 text-rose-700">失败 {counts.failed}</span><span className="rounded bg-amber-50 p-2 text-amber-700">待处理 {counts.pending}</span><span className="rounded bg-slate-50 p-2">中断 {counts.interrupted}</span><span className="rounded bg-slate-50 p-2">取消 {counts.cancelled}</span></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${counts.total ? Math.round((counts.succeeded / counts.total) * 100) : 0}%` }} /></div>
    {showCostWarning && <div data-testid="batch-cost-warning" className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">AI 请求可能已产生费用；已发出的请求仍按真实结果记录。</div>}
    {cancelError && <div role="alert" className="mt-2 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{cancelError}</div>}
    {terminal && onStartNew && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"><span>该批次已结束，可以开始新的批量生成。</span><button type="button" onClick={onStartNew} disabled={anyCommandBusy} className="rounded bg-slate-900 px-2 py-1 text-white">新建批量生成</button></div>}
    {terminal && onViewBatchArticles && displayedBatch.tasks.some((task) => task.status === 'succeeded' && task.articleId) && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded border border-blue-100 bg-blue-50 p-2 text-xs"><span>成功 {counts.succeeded} 篇，可在文章库查看本批次文章。</span><button type="button" onClick={() => onViewBatchArticles(displayedBatch.id, displayedBatch.tasks.find((task) => task.status === 'succeeded' && task.articleId)?.clientId)} disabled={anyCommandBusy} className="rounded bg-blue-700 px-2 py-1 text-white disabled:opacity-40">查看本批次文章</button></div>}
    <div className="generation-batch-task-list mt-4 max-h-56 space-y-1 overflow-y-auto">{displayedBatch.tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-2 text-xs"><span className="flex min-w-0 items-center gap-2 truncate"><span className="truncate">{task.clientId} · {task.platform} · {task.templateId}</span></span><span className={task.status === 'failed' ? 'text-rose-600' : task.status === 'succeeded' ? 'text-emerald-600' : task.status === 'cancelled' ? 'text-slate-400' : 'text-slate-500'}>{task.status}{task.error?.message ? ` · ${task.error.message}` : ''}</span></div>)}</div>
  </section>;
}
