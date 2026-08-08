import { RefreshCw } from "lucide-react";
import { usePlatformFeature } from "../features/platform/platform-feature-context";
import RegularQueueGroupsPanel from "./RegularQueueGroupsPanel";

export default function PlatformWorkbench() {
  const { snapshot, feature } = usePlatformFeature();
  const groups = snapshot.regularQueueGroupViews;
  const groupQuery = snapshot.regularQueueGroups.query;
  const commands = snapshot.commands;
  const legacyRunActive = snapshot.run.isPlatformRunning;
  const residue = snapshot.residue;
  const residueBusy = residue.phase === "checking" || residue.phase === "cleaning";

  return <div className="h-full overflow-y-auto p-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-800">普通平台队列</h2>
        <p className="mt-1 text-xs text-slate-500">按平台和账号串行执行；文章追加与待执行项移除在文章管理中完成。</p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={groupQuery.loading} onClick={() => void feature.refreshRegularQueueGroups("manual")} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"><RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${groupQuery.loading ? "animate-spin" : ""}`} />刷新</button>
        <button type="button" disabled={commands.startAllGroups.busy} onClick={() => void feature.startAllGroups()} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">开始全部</button>
        <button type="button" disabled={commands.pauseAllGroups.busy} onClick={() => void feature.pauseAllGroups()} className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40">暂停全部</button>
      </div>
    </div>
    {groupQuery.error && <p role="alert" className="mb-3 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{groupQuery.error.userMessage}</p>}
    {legacyRunActive && <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <span>检测到升级前已启动的平台任务；只能暂停或停止，不可创建新的旧式任务。</span>
      <button type="button" disabled={commands.pause.busy} onClick={() => void feature.pause(snapshot.run.runId)} className="rounded border border-amber-300 px-2 py-1 disabled:opacity-40">暂停旧任务</button>
      <button type="button" disabled={commands.stop.busy} onClick={() => void feature.stop(snapshot.run.runId)} className="rounded border border-rose-300 px-2 py-1 text-rose-700 disabled:opacity-40">停止旧任务</button>
    </div>}
    <RegularQueueGroupsPanel groups={groups} loading={groupQuery.loading} startBusy={commands.startGroup.busy} pauseBusy={commands.pauseGroup.busy} onStart={(id) => void feature.startGroup(id)} onPause={(id) => void feature.pauseGroup(id)} />
    <section aria-labelledby="queue-residue-heading" className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="queue-residue-heading" className="text-sm font-semibold text-slate-800">已删除文章队列残留</h3>
          <p className="mt-1 text-xs text-slate-500">只检查并清理本地队列残留；不会创建投稿、重试远端请求或删除发布事实。</p>
        </div>
        <button type="button" disabled={residueBusy} onClick={() => void feature.inspectResidue()} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-40">{residue.phase === "checking" ? "检查中…" : "检查残留"}</button>
      </div>
      {residue.phase === "awaiting-confirmation" && <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
        <span>可清理 {residue.cleanableCount} 项，另有 {residue.reportedCount} 项仅报告。</span>
        <button type="button" disabled={commands.cleanupResidue.busy} onClick={() => void feature.cleanupResidue({ confirmed: true })} className="rounded border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-40">确认清理本地残留</button>
      </div>}
      {residue.feedback && <p role={residue.feedback.kind === "error" ? "alert" : "status"} className={`mt-2 text-xs ${residue.feedback.kind === "error" ? "text-rose-700" : "text-emerald-700"}`}>{residue.feedback.text}</p>}
    </section>
  </div>;
}
