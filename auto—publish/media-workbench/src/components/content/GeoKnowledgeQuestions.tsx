import React, { useEffect, useState } from "react";
import {
  getKnowledgeQuestionDetails,
  getKnowledgeQuestionArticles,
} from "../../bridge/geo-knowledge";
import type {
  GeoKnowledge,
  KnowledgeItem,
  KnowledgeQuestionDetails,
  KnowledgeQuestionArticles,
} from "../../types/geo-knowledge";

const buttonClass =
  "rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40";
export default function GeoKnowledgeQuestions({
  knowledge,
  busy,
  link,
  renderItem,
}: {
  knowledge: GeoKnowledge;
  busy: boolean;
  link: (ids: string[]) => Promise<boolean>;
  renderItem: (item: KnowledgeItem) => React.ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [detail, setDetail] = useState<KnowledgeQuestionDetails | null>(null);
  const [articles, setArticles] = useState<KnowledgeQuestionArticles | null>(
    null,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setDetail(null);
    setArticles(null);
    setError("");
    if (active)
      void Promise.all([
        getKnowledgeQuestionDetails(knowledge.clientId, active),
        getKnowledgeQuestionArticles(knowledge.clientId, active),
      ]).then(
        ([result, relatedArticles]) => {
          if (live) {
            setDetail(result);
            setArticles(relatedArticles);
          }
        },
        (reason) => {
          if (live)
            setError(
              reason instanceof Error ? reason.message : "回答读取失败。",
            );
        },
      );
    return () => {
      live = false;
    };
  }, [active, knowledge.clientId, knowledge.revision, refresh]);
  async function add() {
    setMessage("");
    if (await link(selected)) {
      setSelected([]);
      setMessage(
        "已加入问题采集；请在问题采集页选择并启动采集。本操作未联网。已有停用问题保持停用。",
      );
    }
  }
  const item = knowledge.geoQuestions.find((q) => q.id === active);
  const related = item
    ? [...knowledge.offerings, ...knowledge.scenarios].filter((q) =>
        [...item.relatedOfferingIds, ...item.relatedScenarioIds].includes(q.id),
      )
    : [];
  return (
    <div className="grid gap-3">
      <div>
        <button
          className={buttonClass}
          disabled={busy || !selected.length}
          onClick={() => void add()}
        >
          加入问题采集（{selected.length}）
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {knowledge.geoQuestions.map((q) => (
        <div key={q.id} className="grid gap-2">
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={selected.includes(q.id)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, q.id]
                    : selected.filter((id) => id !== q.id),
                )
              }
            />{" "}
            选择 {q.name}
          </label>
          {renderItem(q)}
          <div className="flex items-center gap-2 text-xs">
            <span>
              {q.questionId
                ? "已有采集关联（详情中核对当前状态）"
                : "未加入采集"}{" "}
              · 类型：{q.intent || "未分类"}
            </span>
            <button
              className={buttonClass}
              onClick={() => {
                setActive(q.id);
                setRefresh((n) => n + 1);
              }}
            >
              查看回答与关联：{q.name}
            </button>
          </div>
        </div>
      ))}
      {!knowledge.geoQuestions.length && <p>暂无 GEO 问题。</p>}
      {active && (
        <section
          className="grid gap-2 rounded border p-4"
          aria-label="GEO 问题详情"
        >
          <h3>{item?.name}</h3>
          {error && <p role="alert">{error}</p>}
          {!detail && !error && <p>正在读取回答…</p>}
          {detail && (
            <>
              <p>
                {detail.linkStatus === "unlinked"
                  ? "尚未加入采集"
                  : detail.linkStatus === "stale"
                    ? "关联已失效：采集问题已变更或删除，请重新加入。旧回答不作为当前回答。"
                    : detail.enabled
                      ? "采集问题已启用"
                      : "采集问题已停用"}
              </p>
              {detail.research ? (
                <>
                  <p>
                    最近检测：
                    {detail.research.collectedAt
                      ? new Date(detail.research.collectedAt).toLocaleString()
                      : "未记录"}{" "}
                    · 客户名称字面出现：
                    {detail.clientMentioned === null
                      ? "未知"
                      : detail.clientMentioned
                        ? "是"
                        : "否"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    {detail.research.answerText}
                  </p>
                  {detail.research.references.map((ref, i) => (
                    <p key={i} className="break-all">
                      引用：{ref.title} · {ref.url}
                    </p>
                  ))}
                </>
              ) : (
                <p>暂无与当前问题匹配的真实回答。</p>
              )}
            </>
          )}
          <p>
            关联产品与场景：{related.map((q) => q.name).join("、") || "暂无"}
          </p>
          {articles && (
            <div className="grid gap-2">
              <p>
                关联文章：{articles.total} 篇 · 已发布：
                {articles.publishedCount} 篇
              </p>
              {articles.articles.map((article) => (
                <p key={article.id}>
                  {article.title} · {article.label}
                </p>
              ))}
              {articles.total > articles.articles.length && (
                <p>
                  仅展示前 {articles.articles.length} 篇；完整列表请查看文章库。
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
