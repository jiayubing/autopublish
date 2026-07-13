import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, Save, Sparkles } from 'lucide-react';
import { exportToSubmissionQueue, generateContentArticle, listContentResearch, listContentTemplates, previewExport, saveContentArticle } from '../../electron-api';
import { ContentResearch, ContentTemplate, GeneratedContentArticle } from '../../types';

interface ArticleGenerationViewProps {
  clientId: string;
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

export default function ArticleGenerationView({ clientId, refreshToken, selectedArticle, onArticleChange, onRefresh }: ArticleGenerationViewProps) {
  const [research, setResearch] = useState<ContentResearch[]>([]);
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
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
  const validResearch = useMemo(() => research.filter((item) => Boolean(item.answerText?.trim())), [research]);
  const totalAnswerCharacters = useMemo(() => selectedIds.reduce((total, id) => total + (research.find((item) => item.id === id)?.answerText?.length || 0), 0), [research, selectedIds]);

  useEffect(() => {
    setSelectedIds([]);
    setExportPreview('');
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    const articleForPlatform = selectedArticleRef.current?.platform === platform ? selectedArticleRef.current : null;
    setTemplateId(articleForPlatform?.templateId || '');
    setExportPreview('');
    if (!clientId) { setResearch([]); setTemplates([]); return () => { cancelled = true; }; }
    Promise.all([listContentResearch(clientId), listContentTemplates(platform)]).then(([items, nextTemplates]) => {
      if (cancelled) return;
      setResearch(items); setTemplates(nextTemplates);
      const currentArticle = selectedArticleRef.current?.platform === platform ? selectedArticleRef.current : null;
      const resolvedTemplateId = resolveAvailableTemplateId(currentArticle, nextTemplates);
      if (currentArticle) setTemplateId(resolvedTemplateId);
      else setTemplateId((current) => current || nextTemplates[0]?.id || '');
      if (currentArticle && resolvedTemplateId && resolvedTemplateId !== currentArticle.templateId) {
        onArticleChange({ ...currentArticle, templateId: resolvedTemplateId });
      }
    }).catch((value) => { if (!cancelled) setError(value instanceof Error ? value.message : '无法加载生成素材'); });
    return () => { cancelled = true; };
  }, [clientId, platform, refreshToken]);

  useEffect(() => {
    if (!selectedArticle) return;
    setSelectedIds(selectedArticle.researchQueryIds || (selectedArticle.researchQueryId ? [selectedArticle.researchQueryId] : []));
    setPlatform(selectedArticle.platform); setTemplateId(selectedArticle.templateId);
  }, [selectedArticle]);

  function toggleResearch(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  async function generate() {
    if (!clientId || !selectedIds.length || !templateId || generating) return;
    setGenerating(true); setError('');
    try { onArticleChange(await generateContentArticle({ clientId, researchQueryIds: selectedIds, platform, templateId })); }
    catch (value) { setError(value instanceof Error ? value.message : '生成文章失败'); }
    finally { setGenerating(false); }
  }

  async function save() {
    if (!selectedArticle) return;
    setSaving(true); setError('');
    const resolvedTemplateId = resolveAvailableTemplateId({ ...selectedArticle, templateId }, templates) || selectedArticle.templateId;
    try { onArticleChange(await saveContentArticle({ ...selectedArticle, templateId: resolvedTemplateId, status: 'saved', updatedAt: new Date().toISOString() })); onRefresh(); }
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

  return <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
    <section className="rounded-md border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">选择有效回答</h2><p className="mt-1 text-xs text-slate-500">已选 {selectedIds.length} 条 · 回答总字符数 {totalAnswerCharacters}</p></div><div className="flex gap-2"><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">{PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">{templates.map((item) => <option key={item.id} value={item.id}>{item.scenario}</option>)}</select></div></div><div className="mt-3 grid gap-2">{validResearch.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleResearch(item.id)} className="mt-1" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-700">{item.question || item.id}</span><span className="mt-1 block line-clamp-2 text-xs text-slate-500">{item.answerText}</span></span><span className="text-xs text-slate-400">{item.answerText?.length || 0} 字</span></label>)}</div><button type="button" onClick={generate} disabled={!selectedIds.length || !templateId || generating} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white disabled:opacity-40"><Sparkles className="h-4 w-4" />{generating ? '生成中…' : '生成文章'}</button></section>
    <section className="flex min-h-[360px] flex-1 flex-col rounded-md border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">文章编辑</h2><button type="button" onClick={save} disabled={!selectedArticle || saving} title="保存文章" className="task-icon-button"><Save className="h-4 w-4" /></button></div>{selectedArticle ? <div className="flex min-h-0 flex-1 flex-col gap-3 p-4"><input value={selectedArticle.title} onChange={(event) => onArticleChange({ ...selectedArticle, title: event.target.value })} className="h-10 rounded-md border border-slate-300 px-2 text-base font-semibold" /><textarea value={selectedArticle.content} onChange={(event) => onArticleChange({ ...selectedArticle, content: event.target.value })} className="min-h-64 flex-1 resize-none rounded-md border border-slate-300 p-3 text-sm leading-6" /><div className="flex flex-wrap items-center gap-2"><select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as typeof exportTarget)} className="h-8 rounded border border-slate-300 px-2 text-xs">{EXPORT_TARGETS.map((item) => <option key={item} value={item}>{item}</option>)}</select><button type="button" onClick={preview} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-xs"><Eye className="h-3.5 w-3.5" />导出预览</button><button type="button" onClick={exportArticle} disabled={selectedArticle.status !== 'saved'} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"><Download className="h-3.5 w-3.5" />加入待投稿队列</button>{exportPreview && <span className="text-xs text-slate-500">{exportPreview}</span>}</div></div> : <div className="flex flex-1 items-center justify-center text-sm text-slate-400">选择回答并生成文章，或从历史标签页打开文章</div>}</section>
    {error && <div className="rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
  </div>;
}
