import React, { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { listContentClients } from '../electron-api';
import { ContentClient, GeneratedContentArticle } from '../types';
import ArticleGenerationView from './content/ArticleGenerationView';
import GeneratedArticlesView from './content/GeneratedArticlesView';
import QuestionCollectionView from './content/QuestionCollectionView';

export default function ContentWorkbench() {
  const [clients, setClients] = useState<ContentClient[]>([]);
  const [clientId, setClientId] = useState('');
  const [article, setArticle] = useState<GeneratedContentArticle | null>(null);
  const [tab, setTab] = useState<'questions' | 'generate' | 'history'>('questions');
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listContentClients().then((items) => { setClients(items); setClientId(items[0]?.id || ''); }).catch((value) => setError(value instanceof Error ? value.message : '无法加载客户')).finally(() => setLoading(false));
  }, []);

  function refresh() { setRefreshToken((value) => value + 1); }
  function handleClientChange(nextClientId: string) {
    if (nextClientId === clientId) return;
    setClientId(nextClientId);
    setArticle(null);
  }

  if (loading) return <div className="flex h-full items-center justify-center text-slate-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />加载客户资料</div>;
  return <div className="content-workbench flex h-full min-h-0 flex-col overflow-hidden">
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
      {(['questions', 'generate', 'history'] as const).map((id) => <button id={id} type="button" key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-2 text-xs font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{id === 'questions' ? '问题与采集' : id === 'generate' ? '文章生成' : '历史文章'}</button>)}
      <div className="ml-auto flex items-center gap-2"><label className="text-xs text-slate-500">客户</label><select value={clientId} onChange={(event) => handleClientChange(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
    </div>
    {error && <div className="m-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
    <div className="min-h-0 flex-1">
      {tab === 'questions' && <QuestionCollectionView clients={clients} clientId={clientId} refreshToken={refreshToken} onClientChange={handleClientChange} onRefresh={refresh} />}
      {tab === 'generate' && <ArticleGenerationView client={clients.find((item) => item.id === clientId)} clients={clients} clientId={clientId} refreshToken={refreshToken} selectedArticle={article} onArticleChange={setArticle} onRefresh={refresh} />}
      {tab === 'history' && <GeneratedArticlesView clientId={clientId} refreshToken={refreshToken} onArticleSelect={(nextArticle) => { setArticle(nextArticle); setTab('generate'); }} onRefresh={refresh} />}
    </div>
  </div>;
}
