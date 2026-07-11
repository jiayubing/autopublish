import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, LoaderCircle, Save, Sparkles } from 'lucide-react';
import { ContentClient, ContentResearch, ContentTemplate, GeneratedContentArticle } from '../types';
import { exportToSubmissionQueue, generateContentArticle, listContentArticles, listContentClients, listContentResearch, listContentTemplates, previewExport, saveContentArticle } from '../electron-api';

const PLATFORM_OPTIONS = ['ctrip', 'xiaohongshu', 'dianping'];

export default function ContentWorkbench() {
  const [clients, setClients] = useState<ContentClient[]>([]);
  const [clientId, setClientId] = useState('');
  const [research, setResearch] = useState<ContentResearch[]>([]);
  const [researchId, setResearchId] = useState('');
  const [platform, setPlatform] = useState('ctrip');
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [article, setArticle] = useState<GeneratedContentArticle | null>(null);
  const [history, setHistory] = useState<GeneratedContentArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [exportTarget, setExportTarget] = useState<'media' | 'lieju' | 'toutiao' | 'hepan'>('media');
  const [exportPreview, setExportPreview] = useState('');

  const selectedClient = useMemo(() => clients.find((item) => item.id === clientId) || null, [clients, clientId]);
  const selectedResearch = useMemo(() => research.find((item) => item.id === researchId) || null, [research, researchId]);
  const selectedTemplate = useMemo(() => templates.find((item) => item.id === templateId) || null, [templates, templateId]);
  const canGenerate = Boolean(clientId && researchId && selectedResearch?.answerText?.trim() && templateId && !generating);

  useEffect(() => {
    listContentClients().then((items) => { setClients(items); setClientId(items[0]?.id || ''); })
      .catch((value) => setError(value instanceof Error ? value.message : 'Unable to load clients'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!clientId) { setResearch([]); setResearchId(''); setHistory([]); return; }
    Promise.all([listContentResearch(clientId), listContentArticles(clientId)]).then(([queries, articles]) => {
      setResearch(queries); setResearchId(queries[0]?.id || ''); setHistory(articles);
    }).catch((value) => setError(value instanceof Error ? value.message : 'Unable to load client content'));
  }, [clientId]);

  useEffect(() => {
    listContentTemplates(platform).then((items) => { setTemplates(items); setTemplateId(items[0]?.id || ''); })
      .catch((value) => { setTemplates([]); setTemplateId(''); setError(value instanceof Error ? value.message : 'Unable to load templates'); });
  }, [platform]);

  async function generate() {
    if (!canGenerate) return;
    setGenerating(true); setError('');
    try { setArticle(await generateContentArticle({ clientId, researchQueryId: researchId, platform, templateId })); }
    catch (value) { setError(value instanceof Error ? value.message : 'Unable to generate article'); }
    finally { setGenerating(false); }
  }

  async function save() {
    if (!article) return;
    setSaving(true); setError('');
    try {
      const saved = await saveContentArticle({ ...article, updatedAt: new Date().toISOString() });
      setArticle(saved); setHistory(await listContentArticles(clientId));
    } catch (value) { setError(value instanceof Error ? value.message : 'Unable to save article'); }
    finally { setSaving(false); }
  }
  async function previewSubmissionExport() {
    if (!article || !clientId) return;
    try { const preview = await previewExport({ clientId, generatedArticleId: article.id, targetPlatform: exportTarget, confirmed: true }); setExportPreview(preview.filename); } catch (value) { setError(value instanceof Error ? value.message : 'Export preview failed'); }
  }
  async function exportSubmission() {
    if (!article || !clientId) return;
    try { await exportToSubmissionQueue({ clientId, generatedArticleId: article.id, targetPlatform: exportTarget, confirmed: true }); } catch (value) { setError(value instanceof Error ? value.message : 'Export failed'); }
  }

  if (loading) return <div className="h-full flex items-center justify-center text-slate-500"><LoaderCircle className="w-5 h-5 animate-spin mr-2" />加载客户资料</div>;

  return <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(300px,0.8fr)_minmax(420px,1.4fr)] gap-5 h-full">
    <section className="bg-white border border-slate-200 rounded-lg p-4 min-h-0 overflow-y-auto">
      <label className="block text-xs font-semibold text-slate-500 mb-2">客户</label>
      <select value={clientId} onChange={(event) => setClientId(event.target.value)} className="w-full h-9 px-2 border border-slate-300 rounded-md text-sm bg-white">
        {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="mt-5 text-xs font-semibold text-slate-500">客户资料</div>
      <div className="mt-2 space-y-2">{selectedClient?.knowledgeFiles.map((file) => <div key={file.name} className="border-l-2 border-slate-300 pl-2"><div className="text-xs font-medium text-slate-700 truncate">{file.name}</div><div className="text-xs text-slate-500 line-clamp-3 whitespace-pre-wrap">{file.content}</div></div>)}</div>
      <div className="mt-6 text-xs font-semibold text-slate-500">已保存文章</div>
      <div className="mt-2 space-y-1">{history.map((item) => <button key={item.id} onClick={() => setArticle(item)} className="w-full text-left px-2 py-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 truncate">{item.title}</button>)}</div>
    </section>
    <section className="bg-white border border-slate-200 rounded-lg p-4 min-h-0 overflow-y-auto space-y-5">
      <div><label className="block text-xs font-semibold text-slate-500 mb-2">豆包问题</label><select value={researchId} onChange={(event) => setResearchId(event.target.value)} className="w-full h-9 px-2 border border-slate-300 rounded-md text-sm bg-white">{research.map((item) => <option key={item.id} value={item.id}>{item.question || item.id}</option>)}</select></div>
      <div><div className="text-xs font-semibold text-slate-500 mb-2">豆包回答</div><div className="text-sm text-slate-700 whitespace-pre-wrap leading-6 border border-slate-100 bg-slate-50 p-3 rounded-md max-h-64 overflow-y-auto">{selectedResearch?.answerText || '该问题没有可用回答，无法生成文章。'}</div></div>
      <div><div className="text-xs font-semibold text-slate-500 mb-2">参考资料</div><div className="space-y-2">{selectedResearch?.references.map((item, index) => <a key={index} href={item.url} target="_blank" rel="noreferrer" className="block text-xs border-l-2 border-blue-300 pl-2 text-slate-600 hover:text-blue-700"><div className="font-medium">{item.title}</div><div className="truncate">{item.url}</div></a>)}</div></div>
      <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-semibold text-slate-500 mb-2">平台</label><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="w-full h-9 px-2 border border-slate-300 rounded-md text-sm bg-white">{PLATFORM_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><div><label className="block text-xs font-semibold text-slate-500 mb-2">模板场景</label><select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="w-full h-9 px-2 border border-slate-300 rounded-md text-sm bg-white">{templates.map((item) => <option key={item.id} value={item.id}>{item.scenario}</option>)}</select></div></div>
      {selectedTemplate && <div className="text-xs text-slate-500 border border-slate-100 p-3 rounded-md whitespace-pre-wrap line-clamp-6">{selectedTemplate.body}</div>}
      <button onClick={generate} disabled={!canGenerate} className="w-full h-10 flex justify-center items-center gap-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"><Sparkles className="w-4 h-4" />{generating ? '正在生成' : '生成文章'}</button>
    </section>
    <section className="bg-white border border-slate-200 rounded-lg min-h-0 flex flex-col overflow-hidden">
      <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FileText className="w-4 h-4" />文章编辑</div><button onClick={save} disabled={!article || saving} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40" title="保存文章"><Save className="w-4 h-4" /></button></div>
      {error && <div className="mx-4 mt-3 flex gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 p-2 rounded-md"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
      {article ? <div className="p-4 space-y-3 flex-1 min-h-0 flex flex-col"><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} className="h-10 px-2 border border-slate-300 rounded-md text-base font-semibold" /><textarea value={article.content} onChange={(event) => setArticle({ ...article, content: event.target.value })} className="flex-1 min-h-64 resize-none p-3 border border-slate-300 rounded-md text-sm leading-6" /><div className="flex gap-2"><select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as typeof exportTarget)}><option value="media">media</option><option value="lieju">lieju</option><option value="toutiao">toutiao</option><option value="hepan">hepan</option></select><button onClick={previewSubmissionExport}>预览导出</button><button onClick={exportSubmission} disabled={article.status !== 'saved'}>导出待投稿队列</button></div><p className="text-xs">导出到待投稿队列，仍需在投稿工作台确认</p>{exportPreview && <p className="text-xs">{exportPreview}</p>}</div> : <div className="flex-1 flex items-center justify-center text-sm text-slate-400">生成或选择一篇已保存文章</div>}
    </section>
  </div>;
}
