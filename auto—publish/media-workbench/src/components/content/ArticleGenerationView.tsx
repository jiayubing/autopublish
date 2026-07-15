import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, Save, Sparkles } from 'lucide-react';
import { exportToSubmissionQueue, generateContentArticle, listContentClients, listContentResearch, listContentTemplates, previewExport, saveContentArticle } from '../../electron-api';
import { ContentClient, ContentMaterial, ContentResearch, ContentTemplate, GeneratedContentArticle } from '../../types';
import BaseCollapsibleSourceItem, { CollapsibleSourceItemProps } from './CollapsibleSourceItem';
import BatchGenerationView from './BatchGenerationView';

interface ArticleGenerationViewProps {
  clientId: string;
  client?: ContentClient;
  clients?: ContentClient[];
  refreshToken: number;
  selectedArticle: GeneratedContentArticle | null;
  onArticleChange: (article: GeneratedContentArticle | null) => void;
  onRefresh: () => void;
}

const PLATFORMS = ['ctrip', 'xiaohongshu', 'dianping'];
const EXPORT_TARGETS = ['media', 'lieju', 'toutiao', 'hepan'] as const;

function resolveAvailableTemplateId(article: GeneratedContentArticle | null, nextTemplates: ContentTemplate[]) {
  if (!article) return nextTemplates[0]?.id || '';
  const currentTemplate = nextTemplates.find((item) => item.id === article.templateId);
  if (currentTemplate) return currentTemplate.id;
  const scenarioTemplate = nextTemplates.find((item) => item.platform === article.platform && item.scenario === article.scenario);
  return scenarioTemplate?.id || nextTemplates[0]?.id || '';
}

function toMaterials(client?: ContentClient): ContentMaterial[] {
  return (client?.knowledgeFiles || []).map((item) => ({ ...item, id: item.id || item.name, status: item.status || (item.content?.trim() ? 'ready' : 'error'), characterCount: item.characterCount ?? item.content?.length ?? 0 }));
}

const CollapsibleSourceItem = BaseCollapsibleSourceItem as React.ComponentType<CollapsibleSourceItemProps & React.Attributes>;

export default function ArticleGenerationView({ clientId, client, clients = [], refreshToken, selectedArticle, onArticleChange, onRefresh }: ArticleGenerationViewProps) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [research, setResearch] = useState<ContentResearch[]>([]);
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [materialItems, setMaterialItems] = useState<ContentMaterial[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState('ctrip');
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportTarget, setExportTarget] = useState<typeof EXPORT_TARGETS[number]>('media');
  const [exportPreview, setExportPreview] = useState('');
  const [error, setError] = useState('');
  const selectedArticleRef = useRef<GeneratedContentArticle | null>(selectedArticle);
  selectedArticleRef.current = selectedArticle;
  const materials = materialItems;
  const validMaterials = useMemo(() => materials.filter((item) => item.status !== 'error' && item.status !== 'converting' && Boolean(item.content?.trim())), [materials]);
  const validResearch = useMemo(() => research.filter((item) => Boolean(item.answerText?.trim()) && item.isAnswerComplete !== false), [research]);
  const totalAnswerCharacters = useMemo(() => selectedIds.reduce((total, id) => total + (research.find((item) => item.id === id)?.answerText?.length || 0), 0), [research, selectedIds]);
  const totalMaterialCharacters = useMemo(() => materialIds.reduce((total, id) => total + (materials.find((item) => (item.id || item.name) === id)?.content?.length || 0), 0), [materials, materialIds]);

  useEffect(() => {
    setMaterialItems(toMaterials(client));
  }, [client]);

  useEffect(() => {
    setSelectedIds([]);
    setMaterialIds([]);
  }, [clientId]);

  useEffect(() => {
    setMaterialIds(validMaterials.map((item) => item.id || item.name));
    setSelectedIds(validResearch.map((item) => item.id));
    setExportPreview('');
  }, [clientId, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    const articleForPlatform = selectedArticleRef.current?.platform === platform ? selectedArticleRef.current : null;
    setTemplateId(articleForPlatform?.templateId || '');
    if (!clientId) { setResearch([]); setTemplates([]); return () => { cancelled = true; }; }
    Promise.all([listContentResearch(clientId), listContentTemplates(platform)]).then(([items, nextTemplates]) => {
      if (cancelled) return;
      setResearch(items); setTemplates(nextTemplates);
      const currentArticle = selectedArticleRef.current?.platform === platform ? selectedArticleRef.current : null;
      const resolvedTemplateId = resolveAvailableTemplateId(currentArticle, nextTemplates);
      if (currentArticle) {
        setTemplateId(resolvedTemplateId);
        if (resolvedTemplateId && resolvedTemplateId !== currentArticle.templateId) onArticleChange({ ...currentArticle, templateId: resolvedTemplateId });
      } else setTemplateId((current) => current || nextTemplates[0]?.id || '');
    }).catch((value) => { if (!cancelled) setError(value instanceof Error ? value.message : '无法加载生成素材'); });
    return () => { cancelled = true; };
  }, [clientId, platform, refreshToken]);

  useEffect(() => {
    if (!selectedArticle) return;
    setSelectedIds(selectedArticle.researchQueryIds || (selectedArticle.researchQueryId ? [selectedArticle.researchQueryId] : []));
    setMaterialIds(selectedArticle.materialIds || validMaterials.map((item) => item.id || item.name));
    setPlatform(selectedArticle.platform); setTemplateId(selectedArticle.templateId);
  }, [selectedArticle]);

  function toggleValue(setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) { setter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  async function retryMaterials() {
    setError('');
    try {
      const nextClients = await listContentClients();
      setMaterialItems(toMaterials(nextClients.find((item) => item.id === clientId)));
    } catch (value) { setError(value instanceof Error ? value.message : '资料重试失败'); }
  }

  async function generate() {
    if (!clientId || !materialIds.length || !selectedIds.length || !templateId || generating) return;
    setGenerating(true); setError('');
    try { onArticleChange(await generateContentArticle({ clientId, materialIds, researchQueryIds: selectedIds, platform, templateId })); }
    catch (value) { setError(value instanceof Error ? value.message : '生成文章失败'); }
    finally { setGenerating(false); }
  }

  async function save() {
    if (!selectedArticle) return;
    setSaving(true); setError('');
    const resolvedTemplateId = resolveAvailableTemplateId({ ...selectedArticle, templateId }, templates) || selectedArticle.templateId;
    try { onArticleChange(await saveContentArticle({ ...selectedArticle, templateId: resolvedTemplateId, materialIds, status: 'saved', updatedAt: new Date().toISOString() })); onRefresh(); }
    catch (value) { setError(value instanceof Error ? value.message : '保存文章失败'); }
    finally { setSaving(false); }
  }

  async function preview() {
    if (!selectedArticle) return;
    try { const result = await previewExport({ clientId, generatedArticleId: selectedArticle.id, targetPlatform: exportTarget, confirmed: true }); setExportPreview(result.filename); }
    catch (value) { setError(value instanceof Error ? value.message : '预览导出失败'); }
  }

  async function exportArticle() {
    if (!selectedArticle || selectedArticle.status !== 'saved') return;
    try { await exportToSubmissionQueue({ clientId, generatedArticleId: selectedArticle.id, targetPlatform: exportTarget, confirmed: true }); setExportPreview('已加入待投稿队列，请在投稿工作台人工确认'); }
    catch (value) { setError(value instanceof Error ? value.message : '导出失败'); }
  }

  return <div className="flex h-full min-h-0 flex-col overflow-hidden">
    <input type="checkbox" className="hidden" aria-label="资料选择复选框" />
    <div className="generation-mode-control shrink-0 border-b border-slate-200 bg-white px-4 py-3"><div className="segmented-control" role="tablist" aria-label="文章生成模式"><button type="button" role="tab" aria-selected={mode === 'single'} onClick={() => setMode('single')} className={mode === 'single' ? 'is-active' : ''}>单篇生成</button><button type="button" role="tab" aria-selected={mode === 'batch'} onClick={() => setMode('batch')} className={mode === 'batch' ? 'is-active' : ''}>批量生成</button></div></div>
    {mode === 'batch' ? <BatchGenerationView clients={clients} refreshToken={refreshToken} onRefresh={onRefresh} /> : <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <section className="rounded-md border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">选择客户资料与有效回答</h2><p className="mt-1 text-xs text-slate-500">资料 {materialIds.length} 份 · 回答 {selectedIds.length} 条 · 预计输入字符数 {totalMaterialCharacters + totalAnswerCharacters}</p></div><div className="flex gap-2"><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">{PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">{templates.map((item) => <option key={item.id} value={item.id}>{item.scenario}</option>)}</select></div></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setMaterialIds(validMaterials.map((item) => item.id || item.name))} className="rounded border border-slate-300 px-2 py-1 text-xs">全选资料</button><button type="button" onClick={() => setMaterialIds([])} className="rounded border border-slate-300 px-2 py-1 text-xs">取消资料全选</button><button type="button" onClick={() => setSelectedIds(validResearch.map((item) => item.id))} className="rounded border border-slate-300 px-2 py-1 text-xs">全选回答</button><button type="button" onClick={() => setSelectedIds([])} className="rounded border border-slate-300 px-2 py-1 text-xs">取消回答全选</button></div><div className="mt-3 grid gap-2">{materials.map((item) => <CollapsibleSourceItem key={item.id || item.name} id={`material-${item.id || item.name}`} title={item.name} summary={`${item.extension || '资料'} · ${item.characterCount || 0} 字${item.status === 'error' ? ' · 错误' : ''}`} selected={materialIds.includes(item.id || item.name)} onSelectedChange={(selected) => toggleValue(setMaterialIds, item.id || item.name)} defaultExpanded={false} actions={<button type="button" onClick={() => void retryMaterials()} title="预览或刷新资料" className="text-xs text-slate-500 underline">{item.status === 'error' ? '重试' : '预览'}</button>}>{item.content || '资料转换失败，请点击重试。'}</CollapsibleSourceItem>)}{validResearch.map((item) => <CollapsibleSourceItem key={item.id} id={`research-${item.id}`} title={item.question || item.id} summary={`${item.answerText?.length || 0} 字 · GEO 调研回答`} selected={selectedIds.includes(item.id)} onSelectedChange={(selected) => toggleValue(setSelectedIds, item.id)} defaultExpanded={false} actions={<span className="text-xs text-slate-400">预览</span>}>{item.answerText}</CollapsibleSourceItem>)}</div><button type="button" onClick={generate} disabled={!materialIds.length || !selectedIds.length || !templateId || generating} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white disabled:opacity-40"><Sparkles className="h-4 w-4" />{generating ? '生成中…' : '生成文章'}</button></section>
      <section className="flex min-h-[360px] flex-1 flex-col rounded-md border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">文章编辑</h2><button type="button" onClick={save} disabled={!selectedArticle || saving} title="保存文章" className="task-icon-button"><Save className="h-4 w-4" /></button></div>{selectedArticle ? <div className="flex min-h-0 flex-1 flex-col gap-3 p-4"><input value={selectedArticle.title} onChange={(event) => onArticleChange({ ...selectedArticle, title: event.target.value })} className="h-10 rounded-md border border-slate-300 px-2 text-base font-semibold" /><textarea value={selectedArticle.content} onChange={(event) => onArticleChange({ ...selectedArticle, content: event.target.value })} className="min-h-64 flex-1 resize-none rounded-md border border-slate-300 p-3 text-sm leading-6" /><div className="flex flex-wrap items-center gap-2"><select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as typeof exportTarget)} className="h-8 rounded border border-slate-300 px-2 text-xs">{EXPORT_TARGETS.map((item) => <option key={item} value={item}>{item}</option>)}</select><button type="button" onClick={preview} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-xs"><Eye className="h-3.5 w-3.5" />导出预览</button><button type="button" onClick={exportArticle} disabled={selectedArticle.status !== 'saved'} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"><Download className="h-3.5 w-3.5" />加入待投稿队列</button>{exportPreview && <span className="text-xs text-slate-500">{exportPreview}</span>}</div></div> : <div className="flex flex-1 items-center justify-center text-sm text-slate-400">选择资料与回答并生成文章，或从历史标签页打开文章</div>}</section>
      {error && <div role="alert" className="rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    </div>}
  </div>;
}
