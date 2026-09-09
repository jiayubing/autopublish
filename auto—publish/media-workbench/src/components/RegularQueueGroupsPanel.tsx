import { useEffect, useState } from "react";
import { CirclePause, CirclePlay, Clock3, ImageIcon, Trash2 } from "lucide-react";
import type { RegularQueueGroupSnapshot } from "../types/publication";
import { Button, StatusBadge } from "./ui/primitives";

type QueueGroupView = Omit<RegularQueueGroupSnapshot, "manuallyPaused"> & {
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

function submissionIntervalFrom(value: string) {
  if (!/^(?:0|[1-9]\d{0,2}|[1-2]\d{3}|3[0-5]\d{2}|3600)$/.test(value))
    return null;
  return Number(value);
}

const SYSTEM_PAUSE_REASON_LABELS: Record<string, string> = {
  REGULAR_ACCOUNT_PROFILE_NOT_BOUND: "账号档案尚未绑定当前平台账号，请先完成绑定。",
  REGULAR_ACCOUNT_PROFILE_MISMATCH: "当前登录账号与该账号档案不一致，请切换回原账号或新建档案。",
  REGULAR_ACCOUNT_IDENTITY_UNAVAILABLE: "无法读取当前平台登录身份，请检查登录并保存会话。",
  REGULAR_ACCOUNT_BINDING_UNAVAILABLE: "账号绑定数据当前不可用，请检查诊断信息。",
  REGULAR_ACCOUNT_PROFILE_UNVERIFIED: "账号档案未通过验证，请检查登录与绑定状态。",
  REGULAR_CLIENT_PROFILE_INCOMPLETE: "客户档案不完整，请先补充该客户的平台投稿资料后再开始。",
  REGULAR_PREPARATION_FAILED: "投稿准备失败，任务已安全暂停；请检查资料或诊断信息后再开始。",
};

function systemPauseReason(code: string) {
  return SYSTEM_PAUSE_REASON_LABELS[code] || code;
}

function stateTone(group: QueueGroupView) {
  if (group.current) return "info" as const;
  if (group.pauseIntent === "system") return "warning" as const;
  if (group.actions.canStart) return "neutral" as const;
  return "success" as const;
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
    <div className="grid gap-2">
      <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
          每篇图片数量
        </span>
        <div className="flex items-center gap-2">
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
            className="ui-field h-8 w-20"
          />
          <Button
            size="sm"
            aria-label="保存图片数量"
            disabled={busy || imageCount === null || !changed}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </div>
      </label>
      {feedback && (
        <p
          role={feedback === "图片数量已保存。" ? "status" : "alert"}
          className={`text-[11px] ${
            feedback === "图片数量已保存。"
              ? "text-emerald-700"
              : "text-rose-700"
          }`}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}

function QueueGroupSubmissionIntervalControl({
  group,
  busy,
  onUpdate,
}: {
  group: QueueGroupView;
  busy: boolean;
  onUpdate: (input: {
    queueGroupId: string;
    submissionIntervalSeconds: number;
    expectedRevision: number;
  }) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(String(group.submissionIntervalSeconds));
  const [feedback, setFeedback] = useState("");
  const interval = submissionIntervalFrom(draft);
  const changed = interval !== null && interval !== group.submissionIntervalSeconds;

  useEffect(() => {
    setDraft(String(group.submissionIntervalSeconds));
  }, [group.queueGroupId, group.submissionIntervalSeconds]);

  useEffect(() => {
    setFeedback("");
  }, [group.queueGroupId]);

  async function save() {
    if (interval === null) {
      setFeedback("请输入 0 到 3600 的整数。");
      return;
    }
    setFeedback("");
    try {
      await onUpdate({
        queueGroupId: group.queueGroupId,
        submissionIntervalSeconds: interval,
        expectedRevision: group.revision,
      });
      setFeedback("投稿间隔已保存。");
    } catch (error) {
      setFeedback(
        error instanceof Error && error.message
          ? error.message
          : "保存投稿间隔失败。",
      );
    }
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
          投稿间隔（秒）
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={3600}
            step={1}
            value={draft}
            aria-invalid={interval === null}
            aria-label={`${group.platformLabel} 投稿间隔（秒）`}
            onChange={(event) => {
              setDraft(event.target.value);
              setFeedback("");
            }}
            className="ui-field h-8 w-24"
          />
          <Button
            size="sm"
            aria-label="保存投稿间隔"
            disabled={busy || interval === null || !changed}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </div>
      </label>
      {feedback && (
        <p
          role={feedback === "投稿间隔已保存。" ? "status" : "alert"}
          className={`text-[11px] ${
            feedback === "投稿间隔已保存。"
              ? "text-emerald-700"
              : "text-rose-700"
          }`}
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
  submissionIntervalBusy,
  removeBusy,
  onStart,
  onPause,
  onUpdateImageCount,
  onUpdateSubmissionInterval,
  onRemove,
}: {
  groups: QueueGroupView[];
  loading: boolean;
  startBusy: boolean;
  pauseBusy: boolean;
  imageCountBusy: boolean;
  submissionIntervalBusy: boolean;
  removeBusy: boolean;
  onStart: (queueGroupId: string) => void;
  onPause: (queueGroupId: string) => void;
  onUpdateImageCount: (input: {
    queueGroupId: string;
    imageCount: number;
    expectedRevision: number;
  }) => Promise<unknown>;
  onUpdateSubmissionInterval: (input: {
    queueGroupId: string;
    submissionIntervalSeconds: number;
    expectedRevision: number;
  }) => Promise<unknown>;
  onRemove: (item: RegularQueueGroupSnapshot["remaining"][number]) => void;
}) {
  if (loading)
    return (
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        正在读取普通平台队列组…
      </p>
    );
  if (!groups.length)
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-sm text-slate-500">
        暂无普通平台队列。请在文章库发起投稿后到此查看。
      </p>
    );

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {groups.map((group) => (
        <section
          key={group.queueGroupId}
          className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate text-[13px] font-bold text-slate-800">
                  {group.platformLabel}
                </h3>
                <StatusBadge tone={stateTone(group)}>{group.stateLabel}</StatusBadge>
              </div>
              {group.showAccount && (
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  账号：{group.accountLabel}
                </p>
              )}
              {group.pauseIntent === "system" &&
                group.actions.reasonCode &&
                group.actions.reasonCode !== "REGULAR_QUEUE_GROUP_EMPTY" && (
                  <p className="mt-2 max-w-xl text-[11px] leading-5 text-amber-700">
                    {systemPauseReason(group.actions.reasonCode)}
                  </p>
                )}
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="primary"
                size="sm"
                disabled={startBusy || !group.actions.canStart}
                onClick={() => onStart(group.queueGroupId)}
              >
                <CirclePlay className="h-3.5 w-3.5" />
                开始
              </Button>
              <Button
                size="sm"
                disabled={pauseBusy || !group.actions.canPause}
                onClick={() => onPause(group.queueGroupId)}
              >
                <CirclePause className="h-3.5 w-3.5" />
                暂停
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-100 bg-slate-50/55 px-4 py-3 sm:grid-cols-2">
            <QueueGroupImageCountControl
              group={group}
              busy={imageCountBusy}
              onUpdate={onUpdateImageCount}
            />
            <QueueGroupSubmissionIntervalControl
              group={group}
              busy={submissionIntervalBusy}
              onUpdate={onUpdateSubmissionInterval}
            />
          </div>

          <div className="px-4 py-3">
            {group.current && (
              <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px] text-blue-800">
                <span className="font-semibold">当前执行：</span>
                {articleLabel(group.current)}
              </div>
            )}
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                待执行 · {group.remaining.length}
              </p>
            </div>
            <ol className="grid max-h-56 gap-1.5 overflow-y-auto pr-1">
              {group.remaining.map((item, index) => (
                <li
                  key={item.itemId}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-[11px] text-slate-600 hover:border-slate-100 hover:bg-slate-50"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-[9px] text-slate-500">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={articleLabel(item)}>
                    {articleLabel(item)}
                  </span>
                  <button
                    type="button"
                    disabled={removeBusy}
                    onClick={() => onRemove(item)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    aria-label={`移除 ${articleLabel(item)}`}
                    title="移除待执行项"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ))}
    </div>
  );
}
