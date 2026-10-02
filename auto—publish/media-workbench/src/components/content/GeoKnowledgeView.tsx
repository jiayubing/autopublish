import React, { useEffect, useRef, useState } from "react";
import GeoKnowledgeQuestions from "./GeoKnowledgeQuestions";
import { useGeoKnowledge } from "../../features/content/use-geo-knowledge";

const titles = [
  "产品或服务描述",
  "产品或服务特点",
  "品牌故事",
  "用户痛点",
  "创始人介绍",
  "社会贡献",
  "信任背书",
  "客户案例",
  "客户评价",
];
const button =
  "rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-40";
function splitProse(markdown: string) {
  const blocks = markdown.split(/^##\s+/m);
  const header = blocks.shift() || "";
  const sections = Object.fromEntries(titles.map((title) => [title, ""]));
  const extra: string[] = [];
  for (const block of blocks) {
    const newline = block.indexOf("\n");
    const title = (newline < 0 ? block : block.slice(0, newline)).trim();
    if (titles.includes(title))
      sections[title] +=
        (sections[title] ? "\n\n" : "") +
        (newline < 0 ? "" : block.slice(newline).trim());
    else extra.push("## " + block);
  }
  return { header, sections, extra };
}
export default function GeoKnowledgeView({
  clientId,
  onCollectQuestion,
  onGenerateQuestion,
}: {
  clientId: string;
  onCollectQuestion: (questionId: string) => void;
  onGenerateQuestion: (geoQuestionId: string) => void;
}) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({});
  const feature = useGeoKnowledge(clientId);
  const knowledge = feature.knowledge;
  const current = knowledge?.deliverable;
  const disabled = feature.loading || feature.busy || feature.state.running;
  const [editing, setEditing] = useState<{
    revision: number;
    header: string;
    sections: Record<string, string>;
    extra: string[];
  } | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [clientPrompt, setClientPrompt] = useState("");
  const [temporaryPrompt, setTemporaryPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  useEffect(() => {
    setEditing(null);
    setResearchOpen(false);
    setTemporaryPrompt("");
    setNotice("");
    setQuestionsOpen(false);
    setManualValues({});
  }, [clientId]);
  useEffect(() => {
    setClientPrompt(feature.promptSettings?.clientPrompt || "");
  }, [feature.promptSettings]);
  async function generate() {
    if (!(await feature.saveClientPrompt(clientPrompt))) return;
    setResearchOpen(false);
    if (await feature.generate(temporaryPrompt)) {
      setResearchOpen(false);
      setTemporaryPrompt("");
    }
  }
  async function save() {
    if (!editing) return;
    const markdown =
      [
        editing.header.trim(),
        ...titles
          .filter((title) => editing.sections[title].trim())
          .map((title) => `## ${title}\n\n${editing.sections[title].trim()}`),
        ...editing.extra,
      ]
        .filter(Boolean)
        .join("\n\n") + "\n";
    if (await feature.saveDeliverable(editing.revision, markdown))
      setEditing(null);
  }
  const displayed = splitProse(current?.markdown || "");
  return (
    <section
      className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere]"
      ref={scrollRef}
      aria-label="知识库"
      tabIndex={0}
    >
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="sticky -top-4 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white py-3">
          <h2 className="mr-auto text-lg font-semibold">知识库</h2>
          <button
            className={button}
            disabled={disabled || !!editing}
            onClick={() => setResearchOpen(true)}
          >
            {current ? "重新生成知识库" : "生成知识库"}
          </button>
          <button
            className={button}
            disabled={disabled}
            onClick={() => void feature.reload()}
          >
            刷新
          </button>
          {feature.state.running && (
            <button className={button} onClick={() => void feature.cancel()}>
              取消生成
            </button>
          )}
          {current && (
            <nav
              aria-label="知识库板块导航"
              className="flex w-full flex-wrap gap-1"
            >
              {titles.map((title) => (
                <button
                  key={title}
                  className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2"
                  onClick={() => {
                    const container = scrollRef.current;
                    const target = sectionsRef.current[title];
                    if (!container || !target) return;
                    if (target instanceof HTMLDetailsElement)
                      target.open = true;
                    container.scrollTo({
                      top:
                        container.scrollTop +
                        target.getBoundingClientRect().top -
                        container.getBoundingClientRect().top -
                        parseFloat(getComputedStyle(target).scrollMarginTop),
                    });
                  }}
                >
                  {title}
                </button>
              ))}
            </nav>
          )}
        </div>
        {feature.loading && <p role="status">正在读取知识库…</p>}
        {feature.error && (
          <p role="alert" className="text-rose-700">
            {feature.error}
          </p>
        )}
        {feature.state.running && (
          <p role="status">
            正在生成：{feature.state.phase}
            {feature.state.phase === "K"
              ? " · 正在成稿，最长等待10分钟，请勿重复发起。"
              : ""}
          </p>
        )}
        {feature.state.phase === "failed" && (
          <p role="alert">
            本次生成未完成 · {feature.state.failedPhase || ""} ·{" "}
            {feature.state.errorCode || ""}。已有正文仍保留。
          </p>
        )}
        {feature.state.outcome === "uncertain" && (
          <p role="alert">
            模型响应等待超时或远端结果不确定，已停止，不会自动重试。（
            {feature.state.errorCode}）
          </p>
        )}
        {researchOpen && (
          <section
            className="space-y-3 rounded border p-4"
            aria-label="生成要求"
          >
            <p>本次使用客户资料与联网研究，会消耗已配置接口用量。</p>
            <details>
              <summary>全局研究要求</summary>
              <pre className="whitespace-pre-wrap">
                {feature.promptSettings?.globalPrompt ||
                  feature.promptSettings?.defaultGlobalPrompt}
              </pre>
            </details>
            <p className="text-sm text-slate-500">
              默认沿用已保存的研究要求；有额外要求时再展开修改。
            </p>
            <details className="rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                客户长期研究要求{" "}
                <span className="font-normal text-slate-500">
                  {clientPrompt.trim() ? "· 已设置，生成时应用" : "· 未设置"}
                </span>
              </summary>
              <label className="mt-3 block text-sm">
                客户长期研究要求
                <textarea
                  className="block w-full border p-2"
                  aria-label="客户长期研究要求"
                  maxLength={4000}
                  value={clientPrompt}
                  disabled={disabled}
                  onChange={(event) => setClientPrompt(event.target.value)}
                />
              </label>
            </details>
            <details className="rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                本次临时研究要求{" "}
                <span className="font-normal text-slate-500">
                  {temporaryPrompt.trim() ? "· 已填写，仅本次生效" : "· 可选"}
                </span>
              </summary>
              <label className="mt-3 block text-sm">
                本次临时研究要求
                <textarea
                  className="block w-full border p-2"
                  aria-label="本次临时研究要求"
                  maxLength={2000}
                  value={temporaryPrompt}
                  disabled={disabled}
                  onChange={(event) => setTemporaryPrompt(event.target.value)}
                />
              </label>
            </details>
            <button
              className={button}
              disabled={disabled}
              onClick={() => void generate()}
            >
              保存要求并开始研究
            </button>
            <button
              className={button}
              disabled={disabled}
              onClick={() => setResearchOpen(false)}
            >
              取消
            </button>
          </section>
        )}
        {!current && !feature.loading && (
          <p>
            暂无知识库。可从当前客户资料生成；现有客户资料仍可用于文章生成。
          </p>
        )}
        {knowledge?.pendingDeliverable && (
          <details className="rounded border border-amber-300 p-4">
            <summary>新生成的候选稿（尚未替换当前正文）</summary>
            <pre className="whitespace-pre-wrap">
              {knowledge.pendingDeliverable.markdown}
            </pre>
            {knowledge.pendingDeliverable.warnings.map((warning, i) => (
              <p key={i}>{warning}</p>
            ))}
            <button
              className={button}
              disabled={disabled || !!editing}
              onClick={() => {
                const id = knowledge.pendingDeliverable?.candidateId;
                if (id) void feature.acceptDeliverable(knowledge.revision, id);
              }}
            >
              用此稿替换当前正文
            </button>
          </details>
        )}
        {feature.modelDraft && (
          <details className="rounded border p-4">
            <summary>本次未验证模型草稿（未覆盖当前正文）</summary>
            <pre className="whitespace-pre-wrap">
              {feature.modelDraft.markdown}
            </pre>
          </details>
        )}
        {current && (
          <>
            <p>
              当前正文版本 {current.contentRevision || 1} · 保存时间{" "}
              {new Date(current.savedAt || knowledge.updatedAt).toLocaleString(
                "zh-CN",
                { hour12: false },
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <button
                    className={button}
                    disabled={disabled}
                    onClick={() => void save()}
                  >
                    保存正文
                  </button>
                  <button
                    className={button}
                    disabled={disabled}
                    onClick={() => setEditing(null)}
                  >
                    取消编辑
                  </button>
                </>
              ) : (
                <button
                  className={button}
                  disabled={disabled}
                  onClick={() => {
                    for (const section of Object.values(sectionsRef.current)) {
                      if (section instanceof HTMLDetailsElement)
                        section.open = true;
                    }
                    setEditing({
                      revision: knowledge.revision,
                      ...splitProse(current.markdown),
                    });
                  }}
                >
                  编辑正文
                </button>
              )}
              <button
                className={button}
                disabled={disabled}
                onClick={() => void feature.download()}
              >
                导出 Markdown
              </button>
              <button
                className={button}
                disabled={disabled}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(current.markdown);
                    setNotice("已复制已保存正文。");
                  } catch {
                    setNotice("复制失败，请使用 Markdown 导出。");
                  }
                }}
              >
                复制完整正文
              </button>
            </div>
            {notice && <p role="status">{notice}</p>}
            {editing && (
              <p>复制、导出和文章任务只使用已保存正文；空板块不会导出。</p>
            )}
            {displayed.header.replace(/^#.*$/m, "").trim() && (
              <p className="whitespace-pre-wrap">
                {displayed.header.replace(/^#.*$/m, "").trim()}
              </p>
            )}
            {titles.map((title) => (
              <details
                key={title}
                open={!!editing || !!displayed.sections[title]}
                ref={(element) => {
                  sectionsRef.current[title] = element;
                }}
                className="scroll-mt-48 rounded border border-slate-200 bg-white p-4 sm:p-5"
              >
                <summary className="cursor-pointer">
                  <h3 className="inline font-semibold">{title}</h3>
                  {!editing && !displayed.sections[title] && (
                    <span className="ml-3 text-sm text-slate-400">
                      待补充 · 交付时省略
                    </span>
                  )}
                </summary>
                {editing ? (
                  <textarea
                    aria-label={title}
                    className="mt-3 min-h-32 w-full border p-2"
                    value={editing.sections[title]}
                    disabled={disabled}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        sections: {
                          ...editing.sections,
                          [title]: event.target.value,
                        },
                      })
                    }
                  />
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-slate-700">
                    {displayed.sections[title] ||
                      "暂无有依据的内容，交付时省略。"}
                  </p>
                )}
              </details>
            ))}
            {displayed.extra.length > 0 && (
              <details>
                <summary>保留的原有正文</summary>
                <pre className="whitespace-pre-wrap">
                  {displayed.extra.join("\n")}
                </pre>
              </details>
            )}
          </>
        )}
        {knowledge && (
          <details className="rounded border p-4">
            <summary>研究说明、来源与使用限制</summary>
            {current?.warnings.map((warning, i) => (
              <p key={i}>{warning}</p>
            ))}
            <p>
              客户自述不等于独立认证；行业背景与分析不能改写成客户已提供的服务。人工修改保留来源参考，不代表逐句验证。
            </p>
            <details className="my-3">
              <summary className="cursor-pointer text-sm">详细研究记录</summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm">
                {current?.researchNotes || "旧版本未记录研究过程。"}
              </pre>
            </details>
            {current?.sectionEvidence?.map((item) => (
              <p key={item.title}>
                {item.title}：{item.kinds.join("、")}
              </p>
            ))}
            <ul>
              {knowledge.sources.map((source) => (
                <li key={source.id}>
                  {source.title} · {source.type}
                  {source.url && source.type === "third_party" && (
                    <button
                      className={button}
                      disabled={disabled || !!editing}
                      onClick={() =>
                        void feature.confirmSourceType(
                          source.id,
                          "official_web",
                        )
                      }
                    >
                      确认是客户官网
                    </button>
                  )}
                  {source.url &&
                    ["third_party", "platform"].includes(source.type) && (
                      <button
                        className={button}
                        disabled={disabled || !!editing}
                        onClick={() =>
                          void feature.confirmSourceType(
                            source.id,
                            "client_public",
                          )
                        }
                      >
                        确认是客户公开账号
                      </button>
                    )}
                  {source.url && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={source.url} target="_blank" rel="noreferrer">
                        来源
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {knowledge.restrictions.map((item) => (
              <section key={item.id}>
                <p>
                  {item.name}：{item.description}
                </p>
                {item.type === "conflict" && item.conflictStatus === "open" && (
                  <div>
                    {(item.claimIds || [])
                      .map((id) =>
                        knowledge.profile.claims.find(
                          (claim) => claim.id === id,
                        ),
                      )
                      .filter((claim) => !!claim)
                      .map((claim) => (
                        <button
                          key={claim.id}
                          className={button}
                          disabled={disabled || !!editing}
                          onClick={() =>
                            void feature.resolveConflict(item.id, {
                              claimId: claim.id,
                            })
                          }
                        >
                          采用：{claim.value}
                        </button>
                      ))}
                    <input
                      aria-label={item.name + "确认值"}
                      className="border p-2"
                      value={manualValues[item.id] || ""}
                      disabled={disabled || !!editing}
                      onChange={(event) =>
                        setManualValues({
                          ...manualValues,
                          [item.id]: event.target.value,
                        })
                      }
                    />
                    <button
                      className={button}
                      disabled={
                        disabled || !!editing || !manualValues[item.id]?.trim()
                      }
                      onClick={() =>
                        void feature.resolveConflict(item.id, {
                          value: manualValues[item.id],
                        })
                      }
                    >
                      确认手工值
                    </button>
                  </div>
                )}
              </section>
            ))}
          </details>
        )}
        {knowledge && (
          <section>
            <button
              className={button}
              aria-expanded={questionsOpen}
              onClick={() => setQuestionsOpen(!questionsOpen)}
            >
              GEO 问题
            </button>
            {questionsOpen && (
              <GeoKnowledgeQuestions
                knowledge={knowledge}
                busy={disabled}
                link={feature.link}
                renderItem={(item) => <p>{item.name}</p>}
                onCollect={onCollectQuestion}
                onGenerate={onGenerateQuestion}
              />
            )}
          </section>
        )}
      </div>
    </section>
  );
}
