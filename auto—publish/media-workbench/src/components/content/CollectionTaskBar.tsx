import React from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import type { DoubaoQueueState } from '../../types/content';

interface CollectionTaskBarProps {
  queue: DoubaoQueueState;
  clients: { id: string; name: string }[];
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetry: () => void;
}

export default function CollectionTaskBar({ queue, clients, busy = false, onPause, onResume, onStop, onRetry }: CollectionTaskBarProps) {
  const active = queue.status === 'running' || queue.status === 'paused' || queue.status === 'stopping';
  const statusLabels = { idle: '空闲', running: '运行中', paused: '已暂停', stopping: '停止中', completed: '已完成' };
  const currentTask = queue.tasks.find((task) => task.id === queue.currentTaskId);
  const failedTasks = queue.tasks.filter((task) => task.status === 'failed');
  const succeeded = queue.tasks.filter((task) => task.status === 'succeeded').length;
  const cancelled = queue.tasks.filter((task) => task.status === 'cancelled').length;
  const [showFailures, setShowFailures] = React.useState(false);
  const waitSeconds = Math.ceil(queue.waitRemainingMs / 1000);
  const runningTask = currentTask?.status === 'running' ? currentTask : null;
  const taskLabel = (task: DoubaoQueueState['tasks'][number]) => `${clients.find(client => client.id === task.clientId)?.name || '客户'} · 第 ${queue.tasks.indexOf(task) + 1} 题`;
  return <div style={{ width: '100%', height: 56, minHeight: 56, maxHeight: 56 }} className="collection-task-bar relative h-14 min-h-14 max-h-14 shrink-0 border-t border-slate-200 bg-white px-3 flex items-center justify-between gap-3">
    <div className="flex-1 min-w-0 overflow-hidden text-xs text-slate-600">
      <div className="flex min-w-0 items-center whitespace-nowrap">
        <span className="shrink-0 font-semibold text-slate-800">采集队列</span>
        <span className="ml-2 shrink-0">状态：{statusLabels[queue.status]}</span>
        <span className="ml-2 shrink-0">已处理 {queue.completed}/{queue.total} · 成功 {succeeded} · 失败 {failedTasks.length}{cancelled > 0 ? ` · 已取消 ${cancelled}` : ''}</span>
        {waitSeconds > 0 && <span className="ml-2 shrink-0 text-slate-400">等待 {waitSeconds} 秒</span>}
      </div>
      <div className="min-w-0 truncate" role="status">
        {runningTask && <span>正在采集：{taskLabel(runningTask)}{queue.status === 'stopping' ? '；完成当前题后停止' : ''}</span>}
        {!runningTask && queue.status === 'running' && <span>{waitSeconds > 0 ? '等待下一题，采集仍在继续' : '正在准备下一题'}</span>}
        {currentTask?.status === 'waiting_login' && <span className="ml-2 text-amber-700">豆包需要登录，处理后点击继续</span>}
        {currentTask?.status === 'waiting_human' && <span className="ml-2 text-amber-700">豆包需要人工验证，处理后点击继续</span>}
        {queue.status === 'paused' && !currentTask && <span className="text-amber-700">采集已暂停；检查页面后点击继续，失败题不会自动重发</span>}
        {queue.status === 'completed' && <span>{failedTasks.length > 0 ? '本轮已结束，可查看失败详情或重试失败任务' : '本轮已结束'}</span>}
        {queue.status === 'idle' && <span>尚未开始采集</span>}
      </div>
    </div>
    <div className="flex items-center gap-1">
      {failedTasks.length > 0 && <button type="button" onClick={() => setShowFailures(!showFailures)} aria-expanded={showFailures} className="shrink-0 text-xs text-rose-600">失败详情（{failedTasks.length}）</button>}
      {queue.status === 'running' && <button type="button" onClick={onPause} title="暂停批量采集" className="task-icon-button"><Pause className="h-4 w-4" /></button>}
      {queue.status === 'paused' && <button type="button" onClick={onResume} title="继续批量采集" className="task-icon-button"><Play className="h-4 w-4" /></button>}
      {active && <button type="button" onClick={onStop} title="停止批量采集" className="task-icon-button"><Square className="h-4 w-4" /></button>}
      {queue.status === 'completed' && <button type="button" disabled={busy || failedTasks.length === 0} onClick={onRetry} title="重试失败任务" className="task-icon-button"><RotateCcw className="h-4 w-4" /></button>}
    </div>
    {showFailures && failedTasks.length > 0 && <div role="region" aria-label="采集失败详情" className="absolute bottom-full right-2 z-20 mb-2 max-h-64 w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <div className="mb-2 flex justify-between"><span>本轮失败记录（不代表当前任务状态）</span><button type="button" onClick={() => setShowFailures(false)}>关闭详情</button></div>
      {failedTasks.map(task => <div key={task.id} className="border-t border-slate-100 py-2 break-words">
        <div>{taskLabel(task)}</div>
        <div className="text-rose-600">{task.error?.code} {task.error?.message}</div>
      </div>)}
    </div>}
  </div>;
}

