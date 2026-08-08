import type { RegularQueueGroupSnapshot } from "../types/publication";

type QueueGroupView = RegularQueueGroupSnapshot & {
  platformLabel: string;
  accountLabel: string;
  showAccount: boolean;
  stateLabel: string;
};

export default function RegularQueueGroupsPanel({
  groups,
  loading,
  startBusy,
  pauseBusy,
  onStart,
  onPause,
}: {
  groups: QueueGroupView[];
  loading: boolean;
  startBusy: boolean;
  pauseBusy: boolean;
  onStart: (queueGroupId: string) => void;
  onPause: (queueGroupId: string) => void;
}) {
  if (loading) return <p role="status" className="text-sm text-slate-500">正在读取普通平台队列组…</p>;
  if (!groups.length) return <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">暂无普通平台队列。请在文章管理中选择一个平台和账号后追加文章。</p>;
  return <div className="grid gap-3">
    {groups.map((group) => (
      <section key={group.queueGroupId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{group.platformLabel}</h3>
            {group.showAccount && <p className="mt-1 text-xs text-slate-500">账号：{group.accountLabel}</p>}
            <p className="mt-2 text-xs text-slate-600">状态：{group.stateLabel}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={startBusy || !group.actions.canStart} onClick={() => onStart(group.queueGroupId)} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">开始</button>
            <button type="button" disabled={pauseBusy || !group.actions.canPause} onClick={() => onPause(group.queueGroupId)} className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40">暂停</button>
          </div>
        </div>
        {group.current && <p className="mt-3 text-xs text-blue-700">当前文章：{group.current.articleId}</p>}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
          {group.remaining.map((item) => <li key={item.itemId}>{item.articleId}</li>)}
        </ol>
      </section>
    ))}
  </div>;
}
