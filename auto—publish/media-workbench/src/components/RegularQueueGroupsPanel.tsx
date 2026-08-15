import { useEffect, useState } from "react";
import type { RegularQueueGroupSnapshot } from "../types/publication";

type QueueGroupView = RegularQueueGroupSnapshot & {
  platformLabel: string;
  accountLabel: string;
  showAccount: boolean;
  stateLabel: string;
};

function articleLabel(item: {
  articleSummary?: { title?: string; customerName?: string };
}) {
  const title = item.articleSummary?.title || "标题不可用";
  const customerName = item.articleSummary?.customerName || "客户信息不可用";
  return `${title}（客户：${customerName}）`;
}

function imageCountFrom(value: string) {
  if (!/^(?:0|[1-5])$/.test(value)) return null;
  return Number(value);
}

function QueueGroupImageCountControl({
  group,
  busy,
  onUpdate,
}: {
  group: QueueGroupView;
  busy: boolean;
  onUpdate: (input: {
    queueGroupId: string;
    imageCount: number;
    expectedRevision: number;
  }) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(String(group.imageCount));
  const [feedback, setFeedback] = useState("");
  const imageCount = imageCountFrom(draft);
  const changed = imageCount !== null && imageCount !== group.imageCount;

  useEffect(() => {
    setDraft(String(group.imageCount));
  }, [group.queueGroupId, group.imageCount]);

  useEffect(() => {
    setFeedback("");
  }, [group.queueGroupId]);

  if (!group.imagePublishingSupported) return null;

  async function save() {
    if (imageCount === null) {
      setFeedback("请输入 0 到 5 的整数。");
      return;
    }
    setFeedback("");
    try {
      await onUpdate({
        queueGroupId: group.queueGroupId,
        imageCount,
        expectedRevision: group.revision,
      });
      setFeedback("图片数量已保存。");
    } catch (error) {
      setFeedback(
        error instanceof Error && error.message
          ? error.message
          : "保存图片数量失败。",
      );
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end sm:justify-between">
      <label className="grid gap-1 text-xs font-medium text-slate-700">
        每篇图片数量
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={5}
          value={draft}
          aria-invalid={imageCount === null}
          aria-label={`${group.platformLabel} 每篇图片数量`}
          onChange={(event) => {
            setDraft(event.target.value);
            setFeedback("");
          }}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm sm:w-24"
        />
      </label>
      <button
        type="button"
        disabled={busy || imageCount === null || !changed}
        onClick={() => void save()}
        className="rounded border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 disabled:opacity-40"
      >
        {busy ? "保存中…" : "保存图片数量"}
      </button>
      {feedback && (
        <p
          role={feedback === "图片数量已保存。" ? "status" : "alert"}
          className={`text-xs ${
            feedback === "图片数量已保存。" ? "text-emerald-700" : "text-rose-700"
          } sm:col-span-2`}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}

export default function RegularQueueGroupsPanel({
  groups,
  loading,
  startBusy,
  pauseBusy,
  imageCountBusy,
  removeBusy,
  onStart,
  onPause,
  onUpdateImageCount,
  onRemove,
}: {
  groups: QueueGroupView[];
  loading: boolean;
  startBusy: boolean;
  pauseBusy: boolean;
  imageCountBusy: boolean;
  removeBusy: boolean;
  onStart: (queueGroupId: string) => void;
  onPause: (queueGroupId: string) => void;
  onUpdateImageCount: (input: {
    queueGroupId: string;
    imageCount: number;
    expectedRevision: number;
  }) => Promise<unknown>;
  onRemove: (item: RegularQueueGroupSnapshot["remaining"][number]) => void;
}) {
  if (loading) return <p role="status" className="text-sm text-slate-500">正在读取普通平台队列组…</p>;
  if (!groups.length) return <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">暂无普通平台队列。请在文章库发起投稿后到此查看。</p>;
  return <div className="grid gap-3">
    {groups.map((group) => (
      <section key={group.queueGroupId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{group.platformLabel}</h3>
            {group.showAccount && <p className="mt-1 text-xs text-slate-500">账号：{group.accountLabel}</p>}
            <p className="mt-2 text-xs text-slate-600">状态：{group.stateLabel}</p>
            {group.pauseIntent === "system" && group.actions.reasonCode && group.actions.reasonCode !== "REGULAR_QUEUE_GROUP_EMPTY" && <p className="mt-1 text-xs text-rose-700">暂停原因：{group.actions.reasonCode}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={startBusy || !group.actions.canStart} onClick={() => onStart(group.queueGroupId)} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">开始</button>
            <button type="button" disabled={pauseBusy || !group.actions.canPause} onClick={() => onPause(group.queueGroupId)} className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-40">暂停</button>
          </div>
        </div>
        <QueueGroupImageCountControl
          group={group}
          busy={imageCountBusy}
          onUpdate={onUpdateImageCount}
        />
        {group.current && <p className="mt-3 text-xs text-blue-700">当前文章：{articleLabel(group.current)}</p>}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
          {group.remaining.map((item) => (
            <li key={item.itemId} className="flex flex-wrap items-center justify-between gap-2">
              <span>{articleLabel(item)}</span>
              <button
                type="button"
                disabled={removeBusy}
                onClick={() => onRemove(item)}
                className="rounded border border-amber-300 px-2 py-1 text-[11px] text-amber-800 disabled:opacity-40"
              >
                移除
              </button>
            </li>
          ))}
        </ol>
      </section>
    ))}
  </div>;
}
