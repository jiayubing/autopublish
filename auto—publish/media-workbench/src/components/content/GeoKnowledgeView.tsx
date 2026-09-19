import React, { useState } from "react";
import { useGeoKnowledge } from "../../features/content/use-geo-knowledge";
import type {
  KnowledgeItem,
  KnowledgeSection,
} from "../../types/geo-knowledge";

const sectionLabels: Record<KnowledgeSection, string> = {
  profile: "基础信息",
  offerings: "产品与服务",
  capabilities: "能力与证据",
  scenarios: "场景",
  geoQuestions: "GEO 问题",
  externalResearch: "外部研究",
  restrictions: "待确认与限制",
};
const basisLabels = {
  fact: "客户资料事实",
  research: "外部研究",
  derived: "AI 推导",
  candidate: "待确认",
};
const phaseLabels: Record<string, string> = {
  idle: "尚未生成",
  materials: "正在读取客户资料",
  extracting: "正在提取客户事实",
  planning: "正在制定研究计划",
  researching: "正在联网研究",
  synthesizing: "正在整理知识与 GEO 问题",
  saving: "正在保存知识库",
  complete: "生成完成",
  failed: "本次操作未完成",
};
const buttonClass =
  "rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40";
const fieldLabels: Record<string, string> = {
  name: "客户名称",
  category: "主营品类",
  location: "所在地区",
  address: "地址",
  serviceArea: "服务区域",
  aliases: "别名",
  phone: "联系电话",
  contact: "联系方式",
  foundedYear: "成立年份",
};

export default function GeoKnowledgeView({ clientId }: { clientId: string }) {
  const feature = useGeoKnowledge(clientId);
  const [editing, setEditing] = useState<{
    section: KnowledgeSection;
    item: KnowledgeItem;
  } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<
    "knowledge" | "questions" | "sources" | "restrictions"
  >("knowledge");
  const knowledge = feature.knowledge;
  function beginEdit(section: KnowledgeSection, item: KnowledgeItem) {
    setEditing({ section, item });
    setName(item.name || "");
    setDescription(item.description || "");
    setFields({
      name: "",
      category: "",
      location: "",
      address: "",
      serviceArea: "",
      ...item.fields,
    });
  }
  async function save() {
    if (!knowledge || !editing) return;
    if (
      await feature.edit({
        clientId,
        revision: knowledge.revision,
        section: editing.section,
        id: editing.item.id,
        changes:
          editing.section === "profile"
            ? {
                fields: Object.fromEntries(
                  Object.entries(fields as Record<string, string>).filter(
                    ([, value]) => value.trim(),
                  ),
                ),
              }
            : { name, description },
      })
    )
      setEditing(null);
  }
  const items = knowledge
    ? [
        knowledge.profile,
        ...knowledge.offerings,
        ...knowledge.capabilities,
        ...knowledge.scenarios,
        ...knowledge.geoQuestions,
        ...knowledge.externalResearch,
        ...knowledge.restrictions,
      ]
    : [];
  function renderItem(section: KnowledgeSection, item: KnowledgeItem) {
    return (
      <article
        key={item.id}
        className="rounded border border-slate-200 bg-white p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{item.name || "客户基本信息"}</h3>
          <button
            className={buttonClass}
            disabled={feature.busy || feature.state.running}
            onClick={() => beginEdit(section, item)}
            aria-label={`编辑 ${item.name || "客户基本信息"}`}
          >
            编辑
          </button>
        </div>
        <p className="my-2 text-xs text-slate-500">
          {basisLabels[item.basis]}
          {item.locked ? " · 人工锁定" : ""}
        </p>
        {item.fields ? (
          <dl>
            {Object.entries(item.fields).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <dt>{fieldLabels[key] || key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="whitespace-pre-wrap break-words">
            {item.description || "暂无补充说明"}
          </p>
        )}
        {item.knowledgeCoverage && (
          <p className="mt-2 text-xs">
            知识覆盖：
            {
              (
                {
                  enough: "已覆盖",
                  partial: "部分覆盖",
                  insufficient: "暂无信息",
                } as Record<string, string>
              )[item.knowledgeCoverage]
            }
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          来源：
          {item.sourceIds
            .map(
              (id) =>
                knowledge?.sources.find((source) => source.id === id)?.title ||
                id,
            )
            .join("、") || "暂无来源"}
        </p>
      </article>
    );
  }
  if (!clientId) return <div className="p-6 text-sm">请先选择客户。</div>;
  return (
    <section
      className="flex-1 overflow-auto p-4 text-sm"
      aria-label="客户知识库"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">客户知识库</h2>
          <p className="mt-1 text-xs text-slate-500">
            资料较少也可以生成。知识用于发现问题与辅助文章生产。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={buttonClass}
            disabled={
              feature.loading ||
              feature.busy ||
              feature.state.running ||
              Boolean(editing)
            }
            onClick={() => void feature.generate()}
          >
            {knowledge ? "重新研究" : "生成知识库"}
          </button>
          <button
            className={buttonClass}
            disabled={feature.busy || feature.state.running}
            onClick={() => void feature.reload()}
          >
            刷新知识库
          </button>
          {knowledge && (
            <button
              className={buttonClass}
              onClick={() => void feature.download()}
            >
              导出 Markdown
            </button>
          )}
          {(feature.busy || feature.state.running) && (
            <button
              className={buttonClass}
              onClick={() => void feature.cancel()}
            >
              取消研究
            </button>
          )}
        </div>
      </header>
      {feature.loading && <p role="status">正在读取知识库…</p>}
      {feature.error && (
        <p role="alert" className="mb-3 text-rose-700">
          {feature.error}
        </p>
      )}
      <p role="status" className="mb-3">
        {phaseLabels[feature.state.phase] || "正在处理"}
        {feature.state.total !== undefined
          ? ` ${feature.state.completed || 0} / ${feature.state.total}`
          : ""}
      </p>
      {knowledge && (
        <p className="mb-4 text-xs text-slate-500">
          {knowledge.status.outcome === "partial"
            ? "知识库已保存，部分研究未完成"
            : "知识库已保存"}{" "}
          · 资料{" "}
          {knowledge.sources.filter((s) => s.type === "client_file").length} 份
          · GEO 问题 {knowledge.geoQuestions.length} 个 · 冲突{" "}
          {knowledge.restrictions.filter((i) => i.type === "conflict").length}{" "}
          项 · 人工锁定 {items.filter((i) => i.locked).length} 项 · 上次研究{" "}
          {new Date(knowledge.generatedAt).toLocaleString()}
        </p>
      )}
      {!knowledge && !feature.loading && (
        <p className="rounded border border-dashed p-6 text-slate-500">
          暂无知识库。点击“生成知识库”，从当前客户资料开始整理。
        </p>
      )}
      {editing && (
        <form
          className="mb-4 grid gap-3 rounded border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h3>编辑并锁定</h3>
          {editing.section === "profile" ? (
            Object.entries(fields).map(([key, value]) => (
              <label key={key}>
                {fieldLabels[key] || key}
                <input
                  className="ml-2 border p-2"
                  aria-label={fieldLabels[key] || key}
                  value={value}
                  onChange={(event) =>
                    setFields({ ...fields, [key]: event.target.value })
                  }
                />
              </label>
            ))
          ) : (
            <>
              <label>
                名称或问题
                <input
                  className="block w-full border p-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={2000}
                />
              </label>
              <label>
                说明
                <textarea
                  className="block min-h-24 w-full border p-2"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={12000}
                />
              </label>
            </>
          )}
          <p className="text-xs text-slate-500">
            保存后人工锁定，重新研究不会覆盖此项。
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              className={buttonClass}
              disabled={feature.busy}
            >
              保存并锁定
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setEditing(null)}
            >
              取消编辑
            </button>
          </div>
        </form>
      )}
      {knowledge && (
        <>
          <nav className="mb-4 flex gap-2" aria-label="知识库内容">
            {(
              [
                ["knowledge", "客户知识"],
                ["questions", "GEO 问题"],
                ["sources", "来源与研究"],
                ["restrictions", "待确认"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={buttonClass + (tab === id ? " bg-slate-100" : "")}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "knowledge" && (
            <div className="grid gap-4">
              {renderItem("profile", knowledge.profile)}
              {(["offerings", "capabilities", "scenarios"] as const).map(
                (section) => (
                  <section key={section}>
                    <h3 className="mb-2 font-semibold">
                      {sectionLabels[section]}
                    </h3>
                    <div className="grid gap-2">
                      {knowledge[section].map((item) =>
                        renderItem(section, item),
                      )}
                      {!knowledge[section].length && <p>暂无信息</p>}
                    </div>
                  </section>
                ),
              )}
            </div>
          )}
          {tab === "questions" && (
            <div className="grid gap-2">
              {knowledge.geoQuestions.map((item) =>
                renderItem("geoQuestions", item),
              )}
              {!knowledge.geoQuestions.length && <p>暂无 GEO 问题。</p>}
            </div>
          )}
          {tab === "sources" && (
            <div className="grid gap-3">
              {knowledge.externalResearch.map((item) =>
                renderItem("externalResearch", item),
              )}
              {knowledge.sources.map((source) => (
                <article key={source.id} className="rounded border p-3">
                  <h3>{source.title}</h3>
                  <p className="text-xs text-slate-500">
                    {source.fileName || source.url}
                    {source.fetchedAt
                      ? ` · ${new Date(source.fetchedAt).toLocaleString()}`
                      : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
          {tab === "restrictions" && (
            <div className="grid gap-2">
              {knowledge.status.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
              {knowledge.restrictions.map((item) =>
                renderItem("restrictions", item),
              )}
              {!knowledge.restrictions.length &&
                !knowledge.status.warnings.length && <p>暂无待确认事项。</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
