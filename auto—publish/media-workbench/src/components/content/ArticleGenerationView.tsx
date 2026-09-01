import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Sparkles } from 'lucide-react';
import type { ContentClient, ContentCommandStaleResult, ContentMaterial, ContentResearch, ContentTemplate, ContentTemplateCatalog } from '../../types/content';
import type { GeneratedContentArticle } from '../../types/generation';
import type { SavedContentArticle } from '../../bridge/generation';
import type { ArticleEditorSnapshot } from '../../bridge/content';
import { resolveAvailableTemplateId } from '../../article-history-logic';
import { templateScenarioLabel, templateSourceLabel, templateTitle, visibleGenerationTemplates } from '../../content-generation-ui-logic';
import BaseCollapsibleSourceItem, { CollapsibleSourceItemProps } from './CollapsibleSourceItem';
import BatchGenerationView from './BatchGenerationView';
import GeneratedArticleEditorPanel from './GeneratedArticleEditorPanel';
import { isContentCommandStaleResult } from '../../content-command-result';

interface ArticleGenerationViewProps {
  clientId: string;
  client?: ContentClient;
  clients?: ContentClient[];
  research: ContentResearch[];
  researchByClient: Record<string, ContentResearch[]>;
  getClientDetails?: (clientId: string) => Promise<{ client: ContentClient; research: ContentResearch[] }>;
  templateCatalog?: ContentTemplateCatalog;
  selectedArticle: GeneratedContentArticle | null;
  onArticleChange: (article: GeneratedContentArticle | null) => void;
  commands: {
    retryMaterial: (input: Record<string, unknown>) => Promise<ContentMaterial | ContentCommandStaleResult>;
    saveArticle: (input: Record<string, unknown>) => Promise<GeneratedContentArticle | SavedContentArticle>;
    getArticleEditor?: (input: { clientId: string; articleId: string }) => Promise<unknown>;
  };
  commandStates: { retryMaterial: { busy: boolean }; saveArticle: { busy: boolean } };
  generationFeature: {
    getSnapshot: () => { command: { busy: boolean } };
    subscribe: (listener: () => void) => () => void;
    generate: (input: Record<string, unknown>) => Promise<unknown>;
  };
  onViewBatchArticles?: (batchId: string, clientId?: string) => void;
}
type SubmissionChoice = { id: string; displayName: string };
const SELECTION_CONTROL_TYPE = 'checkbox';
const CollapsibleSourceItem = BaseCollapsibleSourceItem as React.ComponentType<CollapsibleSourceItemProps & React.Attributes>;

function toMaterials(client?: ContentClient): ContentMaterial[] {
  return (client?.knowledgeFiles || []).map((item) => ({
    ...item,
    id: item.id || item.name,
    status: item.status || (item.content?.trim() ? 'ready' : 'error'),
    characterCount: item.characterCount ?? item.content?.length ?? 0,
  }));
}

export default function ArticleGenerationView({ clientId, client, clients = [], research, researchByClient, getClientDetails, templateCatalog, selectedArticle, onArticleChange, commands, commandStates, generationFeature, onViewBatchArticles }: ArticleGenerationViewProps) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [catalogTemplates, setCatalogTemplates] = useState<ContentTemplate[]>([]);
  const [allTemplatePlatforms, setAllTemplatePlatforms] = useState<SubmissionChoice[]>([]);
  const [showBuiltinTemplates, setShowBuiltinTemplates] = useState(false);
  const [templateRevision, setTemplateRevision] = useState('');
  const [templatePlatforms, setTemplatePlatforms] = useState<SubmissionChoice[]>([]);
  const [materialItems, setMaterialItems] = useState<ContentMaterial[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [articleCount, setArticleCount] = useState(1);
  const [error, setError] = useState('');
  const [editorArticle, setEditorArticle] = useState<GeneratedContentArticle | null>(selectedArticle);
  const [editFingerprint, setEditFingerprint] = useState<string | null>(null);
  const editorRequestRef = useRef(0);
  const selectedArticleRef = useRef<GeneratedContentArticle | null>(selectedArticle);
  const materialSelectionTouchedRef = useRef(false);
  const researchSelectionTouchedRef = useRef(false);
  selectedArticleRef.current = selectedArticle;
  const generationSnapshot = useSyncExternalStore(generationFeature.subscribe, generationFeature.getSnapshot, generationFeature.getSnapshot);
  const generating = generationSnapshot.command.busy;

  const materials = materialItems;
  const validMaterials = useMemo(() => materials.filter((item) => item.status !== 'error' && item.status !== 'converting' && Boolean(item.content?.trim())), [materials]);
  const validResearch = useMemo(() => research.filter((item) => Boolean(item.answerText?.trim()) && item.isAnswerComplete !== false), [research]);
  const totalAnswerCharacters = useMemo(() => selectedIds.reduce((total, id) => total + (research.find((item) => item.id === id)?.answerText?.length || 0), 0), [research, selectedIds]);
  const totalMaterialCharacters = useMemo(() => materialIds.reduce((total, id) => total + (materials.find((item) => (item.id || item.name) === id)?.content?.length || 0), 0), [materials, materialIds]);
  const customTemplateCount = useMemo(() => catalogTemplates.filter((item) => item.source === 'custom').length, [catalogTemplates]);
  const visibleCatalogTemplates = useMemo(() => visibleGenerationTemplates({ templates: catalogTemplates }, showBuiltinTemplates), [catalogTemplates, showBuiltinTemplates]);

  function articleEditorSnapshot(value: unknown): ArticleEditorSnapshot | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as { article?: unknown; editFingerprint?: unknown };
    return candidate.article && typeof candidate.article === 'object' && typeof candidate.editFingerprint === 'string'
      ? value as ArticleEditorSnapshot
      : null;
  }

  useEffect(() => { setMaterialItems(toMaterials(client)); }, [client]);
  useEffect(() => {
    const requestId = ++editorRequestRef.current;
    if (!selectedArticle) {
      setEditorArticle(null);
      setEditFingerprint(null);
      return;
    }
    setEditorArticle(selectedArticle);
    setEditFingerprint(null);
    const loadEditor = commands.getArticleEditor;
    if (typeof loadEditor !== 'function') return;
    void loadEditor({ clientId: selectedArticle.clientId || clientId, articleId: selectedArticle.id }).then((result: unknown) => {
      const snapshot = articleEditorSnapshot(result);
      if (requestId !== editorRequestRef.current || !snapshot) return;
      setEditorArticle(snapshot.article);
      setEditFingerprint(snapshot.editFingerprint);
    }).catch(() => {
      if (requestId === editorRequestRef.current) setError('无法读取文章编辑凭证，请重新打开文章后重试。');
    });
  }, [clientId, commands.getArticleEditor, selectedArticle?.clientId, selectedArticle?.id]);
  useEffect(() => {
    materialSelectionTouchedRef.current = false;
    researchSelectionTouchedRef.current = false;
    setSelectedIds([]);
    setMaterialIds([]);
  }, [clientId]);
  useEffect(() => {
    if (selectedArticleRef.current) return;
    setMaterialIds((current) => materialSelectionTouchedRef.current ? current : validMaterials.map((item) => item.id || item.name));
    setSelectedIds((current) => researchSelectionTouchedRef.current ? current : validResearch.map((item) => item.id));
  }, [validMaterials, validResearch]);

  // Template catalog is workspace-wide and must remain available without a client.
  useEffect(() => {
    const catalog = templateCatalog || { revision: '', platforms: [], templates: [], diagnostics: [] };
    setCatalogTemplates(catalog.templates);
    setTemplateRevision(catalog.revision);
    setAllTemplatePlatforms(catalog.platforms.map((item) => ({ id: item.id, displayName: item.displayName || item.id })));
    if (catalog.diagnostics.length) setError(`模板目录有 ${catalog.diagnostics.length} 项诊断，请检查模板文件。`);
  }, [templateCatalog]);

  useEffect(() => {
    const visiblePlatformIds = new Set(visibleCatalogTemplates.map((item) => item.platform));
    const currentArticlePlatform = selectedArticleRef.current?.platform;
    setTemplatePlatforms(allTemplatePlatforms.filter((item) => visiblePlatformIds.has(item.id) || item.id === currentArticlePlatform));
    setPlatform((current) => current && (visiblePlatformIds.has(current) || current === currentArticlePlatform)
      ? current
      : (currentArticlePlatform || visibleCatalogTemplates[0]?.platform || ''));
  }, [allTemplatePlatforms, visibleCatalogTemplates]);

  useEffect(() => {
    const currentArticle = selectedArticleRef.current?.platform === platform ? selectedArticleRef.current : null;
    let nextTemplates = visibleGenerationTemplates({ templates: catalogTemplates }, showBuiltinTemplates).filter((item) => item.platform === platform);
    if (currentArticle && currentArticle.templateId && currentArticle.platform && !nextTemplates.some((item) => item.id === currentArticle.templateId) && currentArticle.templateSnapshot) {
      nextTemplates = [...nextTemplates, {
        id: currentArticle.templateId,
        platform: currentArticle.platform,
        scenario: currentArticle.templateSnapshot.scenario || '历史模板（已删除）',
        name: currentArticle.templateSnapshot.name || '历史模板（已删除）',
        body: currentArticle.templateSnapshot.body || '',
        bodyHash: currentArticle.templateSnapshot.bodyHash,
        source: currentArticle.templateSnapshot.source || 'builtin',
        readOnly: true,
      }];
    }
    setTemplates(nextTemplates);
    const resolvedTemplateId = resolveAvailableTemplateId(currentArticle, nextTemplates);
    if (currentArticle) {
      setTemplateId(resolvedTemplateId);
      if (resolvedTemplateId && resolvedTemplateId !== currentArticle.templateId) onArticleChange({ ...currentArticle, templateId: resolvedTemplateId });
    } else {
      setTemplateId((current) => {
        if (current && nextTemplates.some((item) => item.id === current)) return current;
        if (current) setError('当前模板已被隐藏，请打开“显示内置模板”后重新选择。');
        return resolvedTemplateId;
      });
    }
  }, [catalogTemplates, platform, selectedArticle, onArticleChange, showBuiltinTemplates]);

  useEffect(() => {
    if (!selectedArticle) return;
    materialSelectionTouchedRef.current = true;
    researchSelectionTouchedRef.current = true;
    setSelectedIds(selectedArticle.researchQueryIds || (selectedArticle.researchQueryId ? [selectedArticle.researchQueryId] : []));
    setMaterialIds(selectedArticle.materialIds || validMaterials.map((item) => item.id || item.name));
    setPlatform(selectedArticle.platform || '');
    setTemplateId(selectedArticle.templateId || '');
  }, [selectedArticle, validMaterials]);

  function setMaterialSelection(next: React.SetStateAction<string[]>) { materialSelectionTouchedRef.current = true; setMaterialIds(next); }
  function setResearchSelection(next: React.SetStateAction<string[]>) { researchSelectionTouchedRef.current = true; setSelectedIds(next); }
  async function retryMaterialItem(materialId: string) {
    setError('');
    try {
      const next = await commands.retryMaterial({ clientId, materialId });
      if (isContentCommandStaleResult(next)) return;
      setMaterialItems((current) => current.map((item) => (item.id || item.name) === materialId ? toMaterials({ knowledgeFiles: [next], id: clientId, name: clientId })[0] : item));
    } catch (value) { setError(value instanceof Error ? value.message : '资料重试失败'); }
  }
  async function generate() {
    if (SELECTION_CONTROL_TYPE !== 'checkbox' || !clientId || !materialIds.length || !selectedIds.length || !templateId || generating) return;
    setError('');
      try {
        const result = await generationFeature.generate({ clientId, materialIds, researchQueryIds: selectedIds, platform, templateId, articleCount, templateCatalogRevision: templateRevision });
        if (result && typeof result === 'object' && 'status' in result && (result as { status?: string }).status === 'partial') {
          const value = result as { articles?: unknown[]; failures?: unknown[] };
          setError(`本次已生成 ${value.articles?.length || 0} 篇，${value.failures?.length || 0} 篇失败，可单独手动重试失败项。`);
        }
      }
    catch (value) { setError(value instanceof Error ? value.message : '生成文章失败'); }
  }
  return <div className="flex h-full min-h-0 flex-col overflow-hidden">
    <div className="generation-mode-control shrink-0 border-b border-slate-200 bg-white px-4 py-3"><div className="segmented-control" role="tablist" aria-label="文章生成模式"><button type="button" role="tab" aria-selected={mode === 'single'} onClick={() => setMode('single')} className={mode === 'single' ? 'is-active' : ''}>单篇生成</button><button type="button" role="tab" aria-selected={mode === 'batch'} onClick={() => setMode('batch')} className={mode === 'batch' ? 'is-active' : ''}>批量生成</button></div></div>
     {mode === 'batch' ? <div className="min-h-0 flex-1"><BatchGenerationView clients={clients} currentClientId={clientId} researchByClient={researchByClient} getClientDetails={getClientDetails} templateCatalog={templateCatalog} commands={{ retryMaterial: commands.retryMaterial }} commandStates={commandStates} onViewBatchArticles={onViewBatchArticles} /></div> : <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">选择客户资料与有效回答</h2><p className="mt-1 text-xs text-slate-500">资料 {materialIds.length} 份 · 回答 {selectedIds.length} 条 · 预计输入字符数 {totalMaterialCharacters + totalAnswerCharacters} · 模板目录 {templateRevision ? '已加载' : '未加载'}</p>{!clientId && <p className="mt-1 text-xs text-amber-700">模板目录已加载；当前工作区还没有客户。请在 clients/&lt;客户名称&gt;/ 第一层添加资料，然后刷新客户与模板。</p>}</div><div className="flex min-w-0 flex-wrap items-center gap-2"><label className="text-xs text-slate-500">写作模板平台</label><select aria-label="写作模板平台" value={platform} onChange={(event) => { setPlatform(event.target.value); setTemplateId(''); }} className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs">{templatePlatforms.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select><label className="text-xs text-slate-500">写作模板</label><select aria-label="写作模板" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs">{templates.map((item) => <option key={item.id} value={item.id}>{templateTitle(item)}{templateScenarioLabel(item) ? ` · ${templateScenarioLabel(item)}` : ''} · {templateSourceLabel(item)}</option>)}</select>{customTemplateCount > 0 && <label className="inline-flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" aria-label="显示内置模板" checked={showBuiltinTemplates} onChange={(event) => setShowBuiltinTemplates(event.target.checked)} />显示内置模板</label>}</div></div>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setMaterialSelection(validMaterials.map((item) => item.id || item.name))} className="rounded border border-slate-300 px-2 py-1 text-xs">全选资料</button><button type="button" onClick={() => setMaterialSelection([])} className="rounded border border-slate-300 px-2 py-1 text-xs">取消资料全选</button><button type="button" onClick={() => setResearchSelection(validResearch.map((item) => item.id))} className="rounded border border-slate-300 px-2 py-1 text-xs">全选回答</button><button type="button" onClick={() => setResearchSelection([])} className="rounded border border-slate-300 px-2 py-1 text-xs">取消回答全选</button><label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-600">本次生成 <input aria-label="本次生成篇数" type="number" min={1} max={100} value={articleCount} onChange={(event) => setArticleCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="h-8 w-16 rounded border border-slate-300 px-2" /> 篇</label></div>
        <div className="mt-3 grid gap-2">{materials.map((item) => <CollapsibleSourceItem key={item.id || item.name} id={`material-${item.id || item.name}`} title={item.name} summary={`${item.extension || '资料'} · ${item.characterCount || 0} 字${item.status === 'error' ? ' · 错误' : ''}`} selected={materialIds.includes(item.id || item.name)} onSelectedChange={(selected) => setMaterialSelection((current) => selected ? [...new Set([...current, item.id || item.name])] : current.filter((value) => value !== (item.id || item.name)))} defaultExpanded={false} actions={<button type="button" onClick={() => void retryMaterialItem(item.id || item.name)} disabled={commandStates.retryMaterial.busy} title="预览或刷新资料" className="text-xs text-slate-500 underline disabled:opacity-40">{item.status === 'error' ? (commandStates.retryMaterial.busy ? '重试中…' : '重试') : '预览'}</button>}>{item.content || '资料转换失败，请点击重试。'}</CollapsibleSourceItem>)}{validResearch.map((item) => <CollapsibleSourceItem key={item.id} id={`research-${item.id}`} title={item.question || item.id} summary={`${item.answerText?.length || 0} 字 · GEO 调研回答`} selected={selectedIds.includes(item.id)} onSelectedChange={(selected) => setResearchSelection((current) => selected ? [...new Set([...current, item.id])] : current.filter((value) => value !== item.id))} defaultExpanded={false} actions={<span className="text-xs text-slate-400">预览</span>}>{item.answerText}</CollapsibleSourceItem>)}</div>
        <button type="button" onClick={generate} disabled={!materialIds.length || !selectedIds.length || !clientId || !templateId || generating} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white disabled:opacity-40"><Sparkles className="h-4 w-4" />{generating ? '生成中…' : `生成 ${articleCount} 篇文章`}</button>
      </section>
      <section className="min-h-[360px] flex-1 rounded-md">{editorArticle ? <GeneratedArticleEditorPanel embedded sourceLabel="文章生成" article={editorArticle} editFingerprint={editFingerprint} onEditFingerprintChange={setEditFingerprint} saving={commandStates.saveArticle.busy} onConflict={async () => { const result = await commands.getArticleEditor?.({ clientId: editorArticle.clientId, articleId: editorArticle.id }); return articleEditorSnapshot(result); }} onSaved={(saved) => { setEditorArticle(saved); onArticleChange(saved); }} onClose={() => onArticleChange(null)} onSaveArticle={async (draft, expectedFingerprint) => {
        const resolvedTemplateId = resolveAvailableTemplateId({ ...draft, templateId }, templates) || draft.templateId;
        return commands.saveArticle({ article: { ...editorArticle, templateId: resolvedTemplateId, title: draft.title, content: draft.content, materialIds, status: 'saved', updatedAt: new Date().toISOString() }, expectedFingerprint });
      }} /> : <div className="flex h-full min-h-[360px] items-center justify-center rounded-md border border-slate-200 bg-white text-sm text-slate-400">选择资料与回答并生成文章，或从历史标签页打开文章</div>}</section>{error && <div role="alert" className="rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    </div>}
  </div>;
}
