import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { listContentArticles } from '../../electron-api';
import { GeneratedContentArticle } from '../../types';

interface GeneratedArticlesViewProps { clientId: string; refreshToken: number; onArticleSelect: (article: GeneratedContentArticle) => void; }

export default function GeneratedArticlesView({ clientId, refreshToken, onArticleSelect }: GeneratedArticlesViewProps) {
  const [articles, setArticles] = useState<GeneratedContentArticle[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!clientId) { setArticles([]); return; }
    listContentArticles(clientId).then(setArticles).catch((value) => setError(value instanceof Error ? value.message : '无法加载历史文章'));
  }, [clientId, refreshToken]);
  return <div className="h-full overflow-y-auto p-4"><div className="mb-4"><h2 className="text-base font-semibold text-slate-800">已生成文章</h2><p className="mt-1 text-xs text-slate-500">选择文章后交给生成页继续编辑、保存或导出。</p></div>{error && <div className="mb-3 rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}<div className="grid gap-3">{articles.map((article) => <button type="button" key={article.id} onClick={() => onArticleSelect(article)} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 text-left hover:border-blue-300"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{article.title}</span><span className="mt-1 block text-xs text-slate-500">{article.status} · {article.researchQueryIds?.length || (article.researchQueryId ? 1 : 0)} 条回答 · {article.updatedAt || article.createdAt}</span></span></button>)}{!articles.length && !error && <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">暂无已生成文章</div>}</div></div>;
}
