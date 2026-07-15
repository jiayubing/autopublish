import React, { useMemo, useState } from 'react';
import { Ban, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { cancelPendingGenerationBatch, previewCancelPendingGenerationBatch, reviewContentArticles } from '../../electron-api';
import { GenerationBatch, GenerationBatchState } from '../../types';

interface GenerationBatchDetailProps {
  batch: GenerationBatch;
  state: GenerationBatchState;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onContinue: () => void;
  onStop: () => void;
  onRetry: () => void;
  onReview?: () => void;
  onStartNew?: () => void;
}

export default function GenerationBatchDetail({ batch, state, busy, onPause, onResume, onContinue, onStop, onRetry, onReview, onStartNew }: GenerationBatchDetailProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewError, setReviewError] = useState('');
  const [cancelledBatch, setCancelledBatch] = useState<GenerationBatch | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const displayedBatch = cancelledBatch?.id === batch.id ? cancelledBatch : batch;
  const counts = { total: displayedBatch.tasks.length, succeeded: 0, failed: 0, pending: 0, interrupted: 0, cancelled: 0, ...(displayedBatch.counts || {}) };
  const runtimeStateMatches = state.batchId === batch.id && Boolean(state.status) && state.status !== 'idle';
  const effectiveStatus = runtimeStateMatches ? state.status as string : displayedBatch.status;
  const active = effectiveStatus === 'running' || effectiveStatus === 'stopping';
  const unfinished = counts.pending > 0 || counts.failed > 0 || counts.interrupted > 0;
  const showCostWarning = active || (batch.status === 'stopped' && unfinished);
  const failed = counts.failed > 0;
  const terminal = displayedBatch.status === 'completed' || displayedBatch.status === 'stopped';
  const reviewable = useMemo(() => displayedBatch.tasks.filter((task) => task.status === 'succeeded' && task.articleId), [displayedBatch.tasks]);
  const selectedTasks = reviewable.filter((task) => selected.includes(task.id));

  async function reviewSelected() {
    if (!selectedTasks.length || !window.confirm(`确认审核 ${selectedTasks.length} 篇文章？审核不会自动投稿。`)) return;
    setReviewError('');
    try {
      const result = await reviewContentArticles(selectedTasks.map((task) => ({ clientId: task.clientId, articleId: task.articleId as string })));
      if (result.rejected.length) setReviewError(result.rejected.map((item) => `${item.articleId}: ${item.code}`).join(', '));
      setSelected([]);
      onReview?.();
    } catch (value) { setReviewError(value instanceof Error ? value.message : '审核文章失败'); }
  }

  async function cancelPending() {
    setCancelError('');
    setCancelBusy(true);
    try {
      const preview = await previewCancelPendingGenerationBatch({ batchId: displayedBatch.id });
      if (!preview.canCancel || preview.pendingCount < 1) return;
      if (!window.confirm(`确认永久取消 ${preview.pendingCount} 个待处理生成任务？正在运行的 ${preview.runningCount} 个任务会继续执行，已取消任务不会恢复或重试。`)) return;
      const result = await cancelPendingGenerationBatch({ batchId: displayedBatch.id, confirmed: true });
      setCancelledBatch(result);
    } catch (value) { setCancelError(value instanceof Error ? value.message : '取消待处理生成任务失败'); }
    finally { setCancelBusy(false); }
  }

  return <section className="generation-batch-detail mt-4 rounded-md border border-slate-200 bg-white p-4" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">批量生成进度</h2><p className="mt-1 text-xs text-slate-500">批次 {displayedBatch.id} · 状态 {effectiveStatus}</p></div><div className="flex gap-1"><button type="button" title="暂停批量生成" onClick={onPause} disabled={busy || !active} className="task-icon-button"><Pause className="h-4 w-4" /></button><button type="button" title="继续批量生成" onClick={onResume} disabled={busy || !unfinished} className="task-icon-button"><Play className="h-4 w-4" /></button><button type="button" title="停止批量生成" onClick={onStop} disabled={busy || !active} className="task-icon-button"><Square className="h-4 w-4" /></button><button type="button" title="重试失败任务" onClick={onRetry} disabled={busy || !failed} className="task-icon-button"><RotateCcw className="h-4 w-4" /></button><button type="button" title="永久取消待处理任务" onClick={() => void cancelPending()} disabled={busy || cancelBusy || counts.pending < 1} className="task-icon-button"><Ban className="h-4 w-4" /></button></div></div>
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-6"><span className="rounded bg-slate-50 p-2">总任务 {counts.total}</span><span className="rounded bg-emerald-50 p-2 text-emerald-700">成功 {counts.succeeded}</span><span className="rounded bg-rose-50 p-2 text-rose-700">失败 {counts.failed}</span><span className="rounded bg-amber-50 p-2 text-amber-700">待处理 {counts.pending}</span><span className="rounded bg-slate-50 p-2">中断 {counts.interrupted}</span><span className="rounded bg-slate-50 p-2">取消 {counts.cancelled}</span></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${counts.total ? Math.round((counts.succeeded / counts.total) * 100) : 0}%` }} /></div>
    {showCostWarning && <div data-testid="batch-cost-warning" className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">AI 请求可能已产生费用；停止仅发送取消信号，供应商已开始处理时仍可能计费。</div>}
    {cancelError && <div role="alert" className="mt-2 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{cancelError}</div>}
    {unfinished && !active && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-100 bg-amber-50 p-2 text-xs text-amber-800"><span>批次尚有未完成任务，确认后继续执行。</span><button type="button" onClick={onContinue} disabled={busy} className="rounded bg-amber-700 px-2 py-1 text-white">继续未完成</button></div>}
    {terminal && onStartNew && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"><span>该批次已结束，可以开始新的批量生成。</span><button type="button" onClick={onStartNew} disabled={busy} className="rounded bg-slate-900 px-2 py-1 text-white">新建批量生成</button></div>}
    {reviewable.length > 0 && <div className="mt-4 flex items-center justify-between rounded border border-emerald-100 bg-emerald-50 p-2 text-xs"><span>已选待审核文章：{selectedTasks.length}</span><button type="button" onClick={() => void reviewSelected()} disabled={busy || !selectedTasks.length} className="rounded bg-emerald-700 px-2 py-1 text-white disabled:opacity-40">审核已选</button></div>}
    {reviewError && <div role="alert" className="mt-2 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{reviewError}</div>}
    <div className="generation-batch-task-list mt-4 max-h-56 space-y-1 overflow-y-auto">{displayedBatch.tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-2 text-xs"><span className="flex min-w-0 items-center gap-2 truncate">{task.status === 'succeeded' && task.articleId && <input type="checkbox" aria-label={`选择 ${task.clientId} ${task.articleId}`} checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} disabled={busy} />}<span className="truncate">{task.clientId} · {task.platform} · {task.templateId}</span></span><span className={task.status === 'failed' ? 'text-rose-600' : task.status === 'succeeded' ? 'text-emerald-600' : task.status === 'cancelled' ? 'text-slate-400' : 'text-slate-500'}>{task.status}{task.error?.message ? ` · ${task.error.message}` : ''}</span></div>)}</div>
  </section>;
}
