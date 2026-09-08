import { useEffect, useState } from "react";
import {
  CirclePause,
  CirclePlay,
  Clock3,
  Image,
  ListChecks,
  Trash2,
} from "lucide-react";
import type { RegularQueueGroupSnapshot } from "../types/publication";
import { Button, StatusBadge, Surface } from "./ui/primitives";

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

function groupTone(
  group: QueueGroupView,
): "neutral" | "info" | "success" | "warning" | "danger" {
  if (group.pauseIntent === "system" && group.actions.reasonCode) return "danger";
  if (group.runState === "running") return "success";
  if (group.runState === "paused") return "warning";
  if (group.actions.reasonCode === "REGULAR_QUEUE_GROUP_EMPTY") return "neutral";
  return "info";
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
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Image className="h-3.5 w-3.5" />
        </span>
        每篇图片数量
      </div>
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
          className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
        />
        <Button
          size="sm"
          disabled={busy || imageCount === null || !changed}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存"}
        </Button>
      </div>
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
  const [draft, setDraft] = useState(
    String(group.submissionIntervalSeconds),
  );
  const [feedback, setFeedback] = useState("");
  const interval = submissionIntervalFrom(draft);
  const changed =
    interval !== null && interval !== group.submissionIntervalSeconds;

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
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <Clock3 className="h-3.5 w-3.5" />
        </span>
        投稿间隔（秒）
      </div>
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
          className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
        />
        <Button
          size="sm"
          disabled={busy || interval === null || !changed}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存"}
        </Button>
      </div>
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
      <div
        role="status"
        className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"
      >
        正在读取普通平台队列组…
      </div>
    );

  if (!groups.length)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
        暂无普通平台队列。请在文章库发起投稿后到此查看。
      </div>
    );

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {groups.map((group) => (
        <Surface
          key={group.queueGroupId}
          className="overflow-hidden p-0 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-bold text-slate-900">
                  {group.platformLabel}
                </h3>
                <StatusBadge tone={groupTone(group)}>
                  {group.stateLabel}
                </StatusBadge>
              </div>
              {group.showAccount && (
                <p className="mt-1.5 text-xs text-slate-500">
                  账号：{group.accountLabel}
                </p>
              )}
              {group.pauseIntent === "system" &&
                group.actions.reasonCode &&
                group.actions.reasonCode !== "REGULAR_QUEUE_GROUP_EMPTY" && (
                  <p className="mt-2 max-w-xl text-xs leading-5 text-rose-700">
                    暂停原因：{systemPauseReason(group.actions.reasonCode)}
                  </p>
                )}
            </div>
            <div className="flex gap-2">
              <Button
                tone="success"
                size="sm"
                disabled={startBusy || !group.actions.canStart}
                onClick={() => onStart(group.queueGroupId)}
              >
                <CirclePlay className="h-3.5 w-3.5" />
                开始
              </Button>
              <Button
                tone="warning"
                size="sm"
                disabled={pauseBusy || !group.actions.canPause}
                onClick={() => onPause(group.queueGroupId)}
              >
                <CirclePause className="h-3.5 w-3.5" />
                暂停
              </Button>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-100 bg-slate-50/60 px-4 py-4 sm:grid-cols-2">
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

          <div className="px-4 py-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <ListChecks className="h-4 w-4 text-slate-400" />
              队列文章
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                {group.remaining.length + (group.current ? 1 : 0)}
              </span>
            </div>

            {group.current && (
              <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-500">
                  当前执行
                </div>
                <p className="text-xs font-medium leading-5 text-blue-800">
                  {articleLabel(group.current)}
                </p>
              </div>
            )}

            <ol className="grid gap-1.5">
              {group.remaining.map((item, index) => (
                <li
                  key={item.itemId}
                  className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                    {articleLabel(item)}
                  </span>
                  <Button
                    tone="ghost"
                    size="sm"
                    disabled={removeBusy}
                    onClick={() => onRemove(item)}
                    className="h-7 px-2 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    移除
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        </Surface>
      ))}
    </div>
  );
}
