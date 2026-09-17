import { useAttentionRetarget } from "../../features/attention/use-attention-retarget";
import type { ArticleAttentionItem } from "../../types/publication";

export default function AttentionRetargetDialog({
  items,
  onClose,
  onCommitted,
  onOpenSettings,
}: {
  items: ArticleAttentionItem[];
  onClose: () => void;
  onCommitted: () => void;
  onOpenSettings?: () => void;
}) {
  const {
    targets,
    unavailableTargets,
    profiles,
    platformId,
    setPlatformId,
    accountProfileId,
    setAccountProfileId,
    loading,
    loadError,
    retryLoad,
    busy,
    error,
    result,
    attempted,
    submit,
  } = useAttentionRetarget(items, onCommitted);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="批量改投其他平台"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold">批量改投其他平台</h3>
        <p className="my-3 text-sm text-slate-600">
          将 {items.length}{" "}
          篇原文章加入一个其他平台的普通队列。保留原文和失败记录；成功入队后原待办关闭。本操作不启动投稿。
        </p>
        {loading ? (
          <p role="status">正在读取可用平台…</p>
        ) : loadError ? (
          <p role="alert">
            平台读取失败。<button onClick={retryLoad}>重试</button>
          </p>
        ) : !targets.length ? (
          <p role="status">
            {unavailableTargets.length ? "没有共同可用的其他平台，请查看下方具体原因。" : "没有共同可用的其他平台：未读取到普通平台目录，请刷新或重新启动软件。"}
          </p>
        ) : (
          <fieldset disabled={busy || attempted} className="grid gap-3">
            <label>
              目标平台
              <select
                aria-label="改投目标平台"
                className="ml-2 rounded border p-2"
                value={platformId}
                onChange={(event) => {
                  setPlatformId(event.target.value);
                  setAccountProfileId("");
                }}
              >
                <option value="">请选择一个平台</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              投稿账号
              <select
                aria-label="改投投稿账号"
                className="ml-2 rounded border p-2"
                value={accountProfileId}
                onChange={(event) => setAccountProfileId(event.target.value)}
              >
                <option value="">请选择已绑定账号</option>
                {profiles
                  .filter((profile) => profile.platformId === platformId)
                  .map((profile) => (
                    <option
                      key={profile.accountProfileId}
                      value={profile.accountProfileId}
                    >
                      {profile.displayName}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
        )}
        {!loading && !loadError && (unavailableTargets.length > 0 || !targets.length) && (
          <div className="mt-3 text-sm text-slate-600">
            {unavailableTargets.length > 0 && <p>暂不可选的平台：</p>}
            <ul>{unavailableTargets.map((target) => <li key={target.id}>{target.displayName}：{target.reason}</li>)}</ul>
            <button className="mt-2 rounded border px-2 py-1" disabled={busy || attempted} onClick={retryLoad}>刷新平台和账号</button>
            {onOpenSettings && <button className="ml-2 rounded border px-2 py-1" disabled={busy || attempted} onClick={onOpenSettings}>打开平台设置</button>}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {result && (
          <div role="status" className="mt-3 text-sm">
            <p>
              新增入队 {result.admittedCount} 篇；已存在{" "}
              {result.idempotentCount} 篇；未入队或需核对{" "}
              {
                result.items.filter(
                  (item) => !["queued", "idempotent"].includes(item.status),
                ).length
              }{" "}
              篇。
            </p>
            <ul>
              {result.items.map((item) => (
                <li key={`${item.articleRef.clientId}:${item.articleId}`}>
                  {items.find(
                    (source) =>
                      source.clientId === item.articleRef.clientId &&
                      source.articleId === item.articleId,
                  )?.titleSnapshot || item.articleId}
                  ：
                  {item.status === "queued"
                    ? "已加入队列"
                    : item.status === "idempotent"
                      ? "已在队列"
                      : item.status === "uncertain"
                        ? "结果待核对，请刷新队列"
                        : "未入队，请刷新后检查"}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded border px-3 py-2"
            disabled={busy}
            onClick={onClose}
          >
            {attempted ? "关闭" : "取消"}
          </button>
          <button
            className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-40"
            disabled={
              loading ||
              loadError ||
              !platformId ||
              !accountProfileId ||
              busy ||
              attempted
            }
            onClick={() => void submit()}
          >
            {busy ? "处理中…" : "确认加入队列"}
          </button>
        </div>
      </div>
    </div>
  );
}
