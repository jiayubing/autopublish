import React, { useState } from 'react';
import { Article } from '../types';
import { 
  FileText, 
  Calendar, 
  Tag, 
  ChevronRight, 
  Search, 
  RefreshCw,
  Plus,
  Paperclip,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ArticleListProps {
  articles: Article[];
  activeArticle: Article | null;
  onOpenArticle: (article: Article) => void;
  onScanArticles: () => void;
  isScanning: boolean;
}

export default function ArticleList({
  articles,
  activeArticle,
  onOpenArticle,
  onScanArticles,
  isScanning,
}: ArticleListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter articles based on query
  const filteredArticles = articles.filter(article => 
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <section className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full min-h-[400px]">
      {/* Header & Controls */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-base font-bold text-slate-800">本地待分发稿件</h2>
            <span id="mediaArticleCount" className="px-2.5 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold border border-blue-100/50">
              {articles.length} 篇
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">系统监听目录 <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-semibold">input/media/*</code> 的文件变化</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onScanArticles}
            disabled={isScanning}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-50 text-xs font-medium rounded-lg shadow-2xs transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-blue-500' : ''}`} />
            <span>{isScanning ? '扫描中...' : '重新扫描'}</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-slate-100 flex items-center bg-white px-4 relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-4" />
        <input
          type="text"
          placeholder="快速检索标题、文件名或标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-4 py-1.5 bg-slate-50 focus:bg-white text-xs text-slate-700 placeholder-slate-400 border border-slate-200/60 focus:border-blue-400/80 rounded-lg outline-hidden transition-all"
        />
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto max-h-[500px]">
        {filteredArticles.length === 0 ? (
          <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              {searchQuery ? '没有找到匹配的稿件' : '暂无稿件，将文件放入本地目录'}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              {searchQuery ? '请尝试更换关键词搜索' : '支持格式：.docx、.md、.txt 等自媒体常用格式'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <AnimatePresence initial={false}>
              {filteredArticles.map((article) => {
                const isActive = activeArticle?.filename === article.filename;
                const mediaCount = article.selectedResources.length;

                return (
                  <motion.div
                    layoutId={`article-row-${article.filename}`}
                    key={article.filename}
                    onClick={() => onOpenArticle(article)}
                    className={`p-4 hover:bg-slate-50/50 cursor-pointer transition-all duration-150 flex items-center justify-between gap-4 group relative ${
                      isActive ? 'bg-blue-50/40 hover:bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center space-x-2">
                        <span className={`p-1.5 rounded-lg flex-shrink-0 ${
                          isActive 
                            ? 'bg-blue-100 text-blue-600' 
                            : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-500'
                        } transition-colors`}>
                          <FileText className="w-4 h-4" />
                        </span>
                        <h3 className={`text-xs font-bold leading-snug truncate ${
                          isActive ? 'text-blue-700' : 'text-slate-800'
                        }`}>
                          {article.title}
                        </h3>
                      </div>

                      {/* Meta information */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        <span className="font-mono flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {article.lastModified}
                        </span>
                        <span className="flex items-center">
                          <span className="w-1 h-1 rounded-full bg-slate-300 mr-1.5"></span>
                          {article.words} 字
                        </span>
                        <span className="font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px]">
                          {article.filename}
                        </span>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {article.tags.map(tag => (
                          <span key={tag} className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium border border-slate-200/20">
                            <Tag className="w-2.5 h-2.5 mr-1" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Status Pill & Open Trigger */}
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                        mediaCount > 0 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100/70' 
                          : 'bg-slate-100 text-slate-500 border-transparent'
                      }`}>
                        <Paperclip className={`w-3 h-3 ${mediaCount > 0 ? 'text-emerald-500' : 'text-slate-400'}`} />
                        <span>{mediaCount} 个媒体</span>
                      </span>

                      <button
                        data-open-article={article.filename}
                        className={`p-1.5 rounded-lg border text-xs font-medium transition-all ${
                          isActive 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200 group-hover:border-slate-300 shadow-2xs'
                        }`}
                      >
                        {isActive ? '正在编辑' : '打开'}
                      </button>
                    </div>

                    {/* Blue focus bar on left side */}
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
