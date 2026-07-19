import React from "react";
import type { PlatformTaskSnapshot } from "../types";

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    running: "投稿中",
    "waiting-interval": "等待下一篇",
    stopping: "正在停止",
    completed: "已完成",
    failed: "执行失败",
    stopped: "已停止",
    interrupted: "上次退出时未完成",
  };
  return labels[phase] || phase || "待机";
}

export default function PlatformTaskIndicator({ snapshot, compact = false, onClick }: { snapshot: PlatformTaskSnapshot; compact?: boolean; onClick?: () => void }) {
  const active = Boolean(snapshot.runId) && (snapshot.isPlatformRunning || ["running", "waiting-interval", "stopping"].includes(snapshot.phase));
  const hasSummary = Boolean(snapshot.terminalResult) && ["completed", "failed", "stopped", "interrupted"].includes(snapshot.phase);
  if (!active && !hasSummary) return null;
  const percent = snapshot.total > 0 ? Math.min(100, Math.round((snapshot.processed / snapshot.total) * 100)) : 0;
  const task = snapshot.currentTask || snapshot.nextTask;
  const waitingSeconds = Math.max(0, Math.ceil((snapshot.waitRemainingMs || 0) / 1000));

  if (compact) {
    return (
      <button type="button" onClick={onClick} className="mt-3 w-full rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-left text-xs text-blue-200" title="点击左侧其他平台投稿查看详情">
        <span className="font-semibold">{active ? "投稿中" : phaseLabel(snapshot.phase)}</span>
        <span className="ml-2 text-blue-300">{snapshot.processed}/{snapshot.total}</span>
        <span className="ml-2 text-blue-400">{percent}%</span>
      </button>
    );
  }

  return (
    <section aria-label="平台投稿进度" className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">{active ? "平台投稿进行中" : `投稿任务${phaseLabel(snapshot.phase)}`}</h3>
        <span className="font-mono text-blue-700">{snapshot.processed} / {snapshot.total} · {percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} /></div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <span>成功 {snapshot.succeeded}</span><span>失败 {snapshot.failed}</span><span>跳过 {snapshot.skipped}</span><span>待确认 {snapshot.uncertain}</span>
      </div>
      {task && <p className="mt-3 text-xs">当前：{task.targetPlatformId} · {task.filename}</p>}
      <p className="mt-1 text-xs text-slate-500">阶段：{phaseLabel(snapshot.phase)}{waitingSeconds > 0 ? ` · 还需 ${waitingSeconds} 秒` : ""}</p>
      {!active && snapshot.phase === "interrupted" && <p role="alert" className="mt-2 text-xs text-amber-700">应用上次退出时任务未完成，请核对队列和发布记录。</p>}
    </section>
  );
}
