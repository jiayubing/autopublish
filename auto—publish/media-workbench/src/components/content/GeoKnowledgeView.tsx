import React, { useEffect, useState } from "react";
import GeoKnowledgeQuestions from "./GeoKnowledgeQuestions";
import { useGeoKnowledge } from "../../features/content/use-geo-knowledge";
import type { ConfirmationEntry, KnowledgeItem, KnowledgeSection } from "../../types/geo-knowledge";

const sectionLabels: Record<KnowledgeSection, string> = {
  profile: "基础信息", onlinePresence: "线上身份", history: "客户历史",
  offerings: "产品与服务", capabilities: "能力与证据", cases: "客户案例",
  scenarios: "场景", recommendationAngles: "推荐角度", competitors: "竞对",
  geoQuestions: "GEO 问题", externalResearch: "外部研究", restrictions: "待确认与限制",
};
const knowledgeSections = ["onlinePresence", "history", "offerings", "capabilities", "cases", "scenarios", "recommendationAngles", "competitors"] as const;
const basisLabels = { fact: "客户事实", research: "公开研究", derived: "AI 推导", candidate: "待确认" };
const phaseLabels: Record<string, string> = {
  idle: "尚未生成", materials: "正在读取客户资料", extracting: "正在提取客户事实",
  planning: "正在制定研究计划", researching: "正在联网研究", synthesizing: "正在整理知识与 GEO 问题",
  saving: "正在保存知识库", complete: "生成完成", failed: "本次操作未完成",
};
const fieldLabels: Record<string, string> = {
  name: "客户名称", category: "主营品类", location: "所在地区", address: "地址",
  serviceArea: "服务区域", aliases: "别名", phone: "联系电话", contact: "联系方式", foundedYear: "成立年份",
};
const buttonClass = "rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40";
const confirmationKindLabels: Record<ConfirmationEntry["kind"], string> = {
  fact: "客户事实", research: "公开研究", derived: "推荐角度 / 场景分析", gap: "资料缺口", caution: "谨慎使用",
};

export default function GeoKnowledgeView({ clientId }: { clientId: string }) {
  const feature = useGeoKnowledge(clientId);
  const knowledge = feature.knowledge;
  const disabled = feature.busy || feature.state.running;
  const [tab, setTab] = useState<"knowledge" | "confirmation" | "questions" | "sources" | "restrictions">("knowledge");
  const [selected, setSelected] = useState<{ section: KnowledgeSection; item: KnowledgeItem } | null>(null);
  const [editing, setEditing] = useState<{ section: KnowledgeSection; item: KnowledgeItem } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [researchOpen, setResearchOpen] = useState(false);
  const [clientPrompt, setClientPrompt] = useState("");
  const [temporaryPrompt, setTemporaryPrompt] = useState("");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!feature.promptSettings) return;
    setClientPrompt(feature.promptSettings.clientPrompt);
  }, [feature.promptSettings]);
  useEffect(() => {
    if (!knowledge || !selected) return;
    const item = selected.section === "profile"
      ? knowledge.profile
      : knowledge[selected.section].find(value => value.id === selected.item.id);
    if (item && item !== selected.item) setSelected({ section: selected.section, item });
  }, [knowledge?.revision]);
  useEffect(() => {
    if (!knowledge || !["confirmation", "sources"].includes(tab)) return;
    void feature.previewConfirmation();
  }, [clientId, knowledge?.revision, tab]);

  function beginEdit(section: KnowledgeSection, item: KnowledgeItem) {
    setEditing({ section, item });
    setName(item.name || "");
    setDescription(item.description || "");
    setFields({ name: "", category: "", location: "", address: "", serviceArea: "", ...item.fields });
  }
  async function saveEdit() {
    if (!knowledge || !editing) return;
    const ok = await feature.edit({
      clientId, revision: knowledge.revision, section: editing.section, id: editing.item.id,
      changes: editing.section === "profile"
        ? { fields: Object.fromEntries(Object.entries(fields as Record<string, string>).filter(([, value]) => value.trim())) as Record<string, string> }
        : { name, description },
    });
    if (ok) setEditing(null);
  }
  async function startResearch() {
    if (!(await feature.saveClientPrompt(clientPrompt))) return;
    if (await feature.generate(temporaryPrompt)) {
      setResearchOpen(false);
      setTemporaryPrompt("");
    }
  }
  function compactItem(section: KnowledgeSection, item: KnowledgeItem) {
    const summary = item.fields
      ? Object.values(item.fields).slice(0, 3).join(" · ")
      : item.description || "暂无补充说明";
    return (
      <button
        key={item.id}
        className="w-full rounded border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
        onClick={() => setSelected({ section, item })}
      >
        <span className="flex items-center justify-between gap-3">
          <strong>{item.name || "客户基本信息"}</strong>
          <span className="text-xs text-slate-500">{basisLabels[item.basis]}{item.locked ? " · 已锁定" : ""}</span>
        </span>
        <span className="mt-1 block truncate text-xs text-slate-500">{summary}</span>
      </button>
    );
  }
  function detailDrawer() {
    if (!selected || !knowledge) return <aside className="rounded border border-dashed p-5 text-slate-500">选择一条知识查看详情。</aside>;
    const { section, item } = selected;
    return (
      <aside className="rounded border bg-white p-4" aria-label="知识详情">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{item.name || "客户基本信息"}</h3>
          <button className={buttonClass} onClick={() => setSelected(null)}>关闭</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{sectionLabels[section]} · {basisLabels[item.basis]}{item.locked ? " · 人工锁定" : ""}</p>
        {item.fields ? (
          <dl className="mt-3 grid gap-2">
            {Object.entries(item.fields).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{fieldLabels[key] || key}</dt><dd>{value}</dd></div>)}
          </dl>
        ) : <p className="mt-3 whitespace-pre-wrap break-words">{item.description || "暂无补充说明"}</p>}
        {item.url && <a className="mt-3 block break-all text-blue-700" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}
        <div className="mt-3 text-xs text-slate-500">
          来源：{item.sourceIds.map(id => knowledge.sources.find(source => source.id === id)?.title || id).join("、") || "暂无来源"}
        </div>
        {!(["recommendationAngles", "restrictions"] as KnowledgeSection[]).includes(section) && (
          <button className={buttonClass + " mt-4"} disabled={disabled} onClick={() => beginEdit(section, item)}>编辑并锁定</button>
        )}
      </aside>
    );
  }

  if (!clientId) return <div className="p-6 text-sm">请先选择客户。</div>;
  return (
    <section className="flex-1 overflow-auto p-4 text-sm" aria-label="客户知识库">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">客户知识库</h2><p className="mt-1 text-xs text-slate-500">客户实体优先研究；知识用于发现问题与辅助文章生产。</p></div>
        <div className="flex gap-2">
          <button className={buttonClass} disabled={feature.loading || disabled || Boolean(editing)} onClick={() => setResearchOpen(true)}>{knowledge ? "重新研究" : "生成知识库"}</button>
          <button className={buttonClass} disabled={disabled} onClick={() => void feature.reload()}>刷新</button>
          {disabled && <button className={buttonClass} onClick={() => void feature.cancel()}>取消研究</button>}
        </div>
      </header>
      {feature.loading && <p role="status">正在读取知识库…</p>}
      {feature.error && <p role="alert" className="mb-3 text-rose-700">{feature.error}</p>}
      <p role="status" className="mb-3">{phaseLabels[feature.state.phase] || "正在处理"}{feature.state.failedPhase ? ` · 失败阶段：${phaseLabels[feature.state.failedPhase] || feature.state.failedPhase}` : ""}{feature.state.total !== undefined ? ` ${feature.state.completed || 0} / ${feature.state.total}` : ""}</p>
      {feature.storageStatus === "legacy_v1" && !knowledge && <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-4">旧版知识库需要重新研究。新版完整生成前，旧文件会保持不变。</p>}
      {knowledge && <p className="mb-4 text-xs text-slate-500">{knowledge.status.outcome === "partial" ? "知识库已保存，部分研究未完成" : "知识库已保存"} · 来源 {knowledge.sources.length} 个 · GEO 问题 {knowledge.geoQuestions.length} 个 · 待确认 {knowledge.restrictions.filter(item => item.type === "conflict" && item.conflictStatus === "open").length} 项</p>}

      {researchOpen && (
        <div className="mb-4 grid gap-3 rounded border bg-white p-4" role="dialog" aria-label="研究要求">
          <h3 className="font-semibold">研究要求</h3>
          <label>此客户长期补充要求<textarea className="mt-1 block min-h-20 w-full border p-2" maxLength={4000} value={clientPrompt} disabled={disabled} onChange={event => setClientPrompt(event.target.value)} /></label>
          <label>本次临时要求（不会保存）<textarea className="mt-1 block min-h-20 w-full border p-2" maxLength={2000} value={temporaryPrompt} disabled={disabled} onChange={event => setTemporaryPrompt(event.target.value)} /></label>
          <p className="text-xs text-slate-500">客户实体优先，最多两轮；正常约 14 次请求，格式修复时程序硬上限 18 次。</p>
          <div className="flex gap-2"><button className={buttonClass} disabled={disabled} onClick={() => void startResearch()}>保存要求并开始研究</button><button className={buttonClass} disabled={disabled} onClick={() => setResearchOpen(false)}>取消</button></div>
        </div>
      )}

      {editing && (
        <form className="mb-4 grid gap-3 rounded border bg-white p-4" onSubmit={event => { event.preventDefault(); void saveEdit(); }}>
          <h3 className="font-semibold">编辑并锁定</h3>
          {editing.section === "profile" ? Object.entries(fields).map(([key, value]) => (
            <label key={key}>{fieldLabels[key] || key}<input className="ml-2 border p-2" value={value} onChange={event => setFields({ ...fields, [key]: event.target.value })} /></label>
          )) : <><label>名称<input className="block w-full border p-2" value={name} maxLength={2000} required onChange={event => setName(event.target.value)} /></label><label>说明<textarea className="block min-h-24 w-full border p-2" value={description} maxLength={12000} onChange={event => setDescription(event.target.value)} /></label></>}
          <div className="flex gap-2"><button className={buttonClass} disabled={disabled}>保存并锁定</button><button type="button" className={buttonClass} onClick={() => setEditing(null)}>取消</button></div>
        </form>
      )}

      {!knowledge && !feature.loading && feature.storageStatus !== "legacy_v1" && <p className="rounded border border-dashed p-6 text-slate-500">暂无知识库。点击“生成知识库”，从当前客户资料开始整理。</p>}
      {knowledge && <>
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="知识库内容">
          {([ ["knowledge", "客户知识"], ["confirmation", "客户确认稿"], ["questions", "GEO 问题"], ["sources", "来源"], ["restrictions", "待确认"] ] as const).map(([id, label]) => <button key={id} className={buttonClass + (tab === id ? " bg-slate-100" : "")} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        {tab === "knowledge" && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-4">
          <section><h3 className="mb-2 font-semibold">基础信息</h3>{compactItem("profile", knowledge.profile)}</section>
          {knowledgeSections.map(section => <section key={section}><h3 className="mb-2 font-semibold">{sectionLabels[section]}</h3><div className="grid gap-2">{knowledge[section].map(item => compactItem(section, item))}{!knowledge[section].length && <p className="text-slate-500">暂无信息</p>}</div></section>)}
        </div>{detailDrawer()}</div>}
        {tab === "confirmation" && <section aria-label="客户确认稿" className="grid gap-4">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-4">
            <div><h3 className="font-semibold">客户确认稿</h3><p className="mt-1 text-xs text-slate-500">仅重组当前客户知识，不调用 AI，也不会回写知识库。</p></div>
            <button className={buttonClass} disabled={disabled || feature.confirmationLoading || !feature.confirmation} onClick={() => void feature.download()}>导出 Markdown</button>
          </header>
          {feature.confirmationLoading && <p role="status">正在整理客户确认稿…</p>}
          {feature.confirmation?.sections.map(section => <article key={section.id} className="rounded border bg-white p-4">
            <h3 className="font-semibold">{section.title}</h3>
            <div className="mt-3 grid gap-3">{section.entries.map((entry, index) => <div key={`${entry.title}-${index}`} className={"rounded p-3 " + (entry.kind === "gap" || entry.kind === "caution" ? "bg-amber-50" : "bg-slate-50")}>
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{entry.title}</strong><span className="text-xs text-slate-500">{confirmationKindLabels[entry.kind]}</span></div>
              <p className="mt-2 whitespace-pre-wrap break-words">{entry.body}</p>
              {entry.attributionRequired && <p className="mt-2 text-xs text-amber-800">对外使用时请保留来源或限定表述。</p>}
            </div>)}</div>
          </article>)}
          {!feature.confirmationLoading && !feature.confirmation && <p className="rounded border border-dashed p-6 text-slate-500">确认稿暂不可用，请刷新后重试。</p>}
        </section>}
        {tab === "questions" && <GeoKnowledgeQuestions knowledge={knowledge} busy={disabled || Boolean(editing)} link={feature.link} renderItem={item => compactItem("geoQuestions", item)} />}
        {tab === "sources" && <div className="grid gap-3">{knowledge.externalResearch.map(item => compactItem("externalResearch", item))}{knowledge.sources.map(source => (
          <article key={source.id} className="rounded border bg-white p-3"><h3>{source.title}</h3><p className="break-all text-xs text-slate-500">{source.fileName || source.url} · {source.type}</p>
            <div className="mt-2 text-xs text-slate-600"><strong>支持的确认稿内容：</strong>{feature.confirmation?.sections.flatMap(section => section.entries.filter(entry => entry.sourceIds.includes(source.id)).map(entry => `${section.title}：${entry.title}`)).join("；") || (feature.confirmationLoading ? "正在读取…" : "暂无正向知识引用")}</div>
            {source.url && <div className="mt-2 flex gap-2">{source.type === "third_party" && <button className={buttonClass} disabled={disabled} onClick={() => void feature.confirmSourceType(source.id, "official_web")}>确认是客户官网</button>}{["third_party", "platform"].includes(source.type) && <button className={buttonClass} disabled={disabled} onClick={() => void feature.confirmSourceType(source.id, "client_public")}>确认是客户公开账号</button>}</div>}
          </article>
        ))}</div>}
        {tab === "restrictions" && <div className="grid gap-3">
          {knowledge.status.warnings.map((warning, index) => <p key={index} className="rounded bg-amber-50 p-3">{warning}</p>)}
          {knowledge.restrictions.map(item => {
            const claims = (item.claimIds || []).map(id => knowledge.profile.claims?.find(claim => claim.id === id)).filter(Boolean);
            return <article key={item.id} className="rounded border bg-white p-3"><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-slate-600">{item.description}</p>
              {item.type === "conflict" && item.conflictStatus === "open" && <div className="mt-3 grid gap-2">{claims.map(claim => claim && <button key={claim.id} className={buttonClass} disabled={disabled} onClick={() => void feature.resolveConflict(item.id, { claimId: claim.id })}>采用：{claim.value}</button>)}
                <div className="flex gap-2"><input className="min-w-0 flex-1 border p-2" placeholder="手工填写确认值" value={manualValues[item.id] || ""} onChange={event => setManualValues({ ...manualValues, [item.id]: event.target.value })} /><button className={buttonClass} disabled={disabled || !(manualValues[item.id] || "").trim()} onClick={() => void feature.resolveConflict(item.id, { value: manualValues[item.id] })}>确认手工值</button></div>
              </div>}
            </article>;
          })}
          {!knowledge.restrictions.length && !knowledge.status.warnings.length && <p>暂无待确认事项。</p>}
        </div>}
      </>}
    </section>
  );
}
