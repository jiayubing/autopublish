import React from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import { DoubaoQueueState } from '../../types';

interface CollectionTaskBarProps {
  queue: DoubaoQueueState;
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetry: () => void;
}

export default function CollectionTaskBar({ queue, busy = false, onPause, onResume, onStop, onRetry }: CollectionTaskBarProps) {
  const active = queue.status === 'running' || queue.status === 'paused' || queue.status === 'stopping';
  const statusLabels = { idle: '空闲', running: '运行中', paused: '已暂停', stopping: '停止中', completed: '已完成' };
  const currentTask = queue.tasks.find((task) => task.id === queue.currentTaskId);
  const latestFailed = [...queue.tasks].reverse().find((task) => task.status === 'failed');
  const waitSeconds = Math.ceil(queue.waitRemainingMs / 1000);
  return <div style={{ width: '100%', height: 56, minHeight: 56, maxHeight: 56 }} className="collection-task-bar h-14 min-h-14 max-h-14 shrink-0 overflow-hidden border-t border-slate-200 bg-white px-3 flex items-center justify-between gap-3">
    <div className="flex-1 min-w-0 overflow-hidden text-xs text-slate-600">
      <div className="flex min-w-0 items-center whitespace-nowrap">
        <span className="shrink-0 font-semibold text-slate-800">采集队列</span>
        <span className="ml-2 shrink-0">状态：{statusLabels[queue.status]}</span>
        <span className="ml-2 shrink-0">{queue.completed}/{queue.total}</span>
        {waitSeconds > 0 && <span className="ml-2 shrink-0 text-slate-400">等待 {waitSeconds} 秒</span>}
      </div>
      <div className="min-w-0 truncate">
        {currentTask && <span>当前问题：{currentTask.questionId}</span>}
        {latestFailed?.error && <span className="ml-2 text-rose-600">最近失败：{latestFailed?.error?.code} {latestFailed?.error?.message}</span>}
      </div>
    </div>
    <div className="flex items-center gap-1">
      {queue.status === 'running' && <button type="button" onClick={onPause} title="暂停批量采集" className="task-icon-button"><Pause className="h-4 w-4" /></button>}
      {queue.status === 'paused' && <button type="button" onClick={onResume} title="继续批量采集" className="task-icon-button"><Play className="h-4 w-4" /></button>}
      {active && <button type="button" onClick={onStop} title="停止批量采集" className="task-icon-button"><Square className="h-4 w-4" /></button>}
      {queue.status === 'completed' && <button type="button" disabled={busy} onClick={onRetry} title="重试失败任务" className="task-icon-button"><RotateCcw className="h-4 w-4" /></button>}
    </div>
  </div>;
}
