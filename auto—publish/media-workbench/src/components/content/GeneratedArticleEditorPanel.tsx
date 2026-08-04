import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Save, X } from 'lucide-react';
import type { GeneratedContentArticle } from '../../types/generation';
import { useConfirmation } from '../../confirmation';

interface GeneratedArticleEditorPanelProps {
  article: GeneratedContentArticle;
  published?: boolean;
  onSaved: (article: GeneratedContentArticle) => void;
  onClose: () => void;
  onCopyVersion?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveArticle?: (article: GeneratedContentArticle) => Promise<GeneratedContentArticle>;
  saving?: boolean;
  footer?: ReactNode;
  embedded?: boolean;
  sourceLabel?: string;
}

export default function GeneratedArticleEditorPanel({ article, published = false, onSaved, onClose, onCopyVersion, onDirtyChange, onSaveArticle, saving = false, footer, embedded = false, sourceLabel = '历史文章' }: GeneratedArticleEditorPanelProps) {
  const { confirm } = useConfirmation();
  const [draft, setDraft] = useState(article);
  const [base, setBase] = useState(article);
  const [error, setError] = useState('');
  const saveInFlightRef = useRef(false);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dirty = draft.title !== base.title || draft.content !== base.content;
  const requiresInitialSave = base.status === 'generated';

  useEffect(() => {
    setDraft(article);
    setBase(article);
    setError('');
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [article.id]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        void close();
        return;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dirty]);

  async function close() {
    if (dirty && !(await confirm({ title: '放弃未保存修改？', message: '文章有未保存修改，确认关闭并放弃这些修改吗？', confirmLabel: '放弃修改', tone: 'warning' }))) return;
    onClose();
  }

  async function save() {
    if (published || (!dirty && !requiresInitialSave) || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setError('');
    try {
      if (!onSaveArticle) throw new Error('文章保存命令不可用');
      const saved = await onSaveArticle(draft);
      setDraft(saved);
      setBase(saved);
      onSaved(saved);
    } catch (value) {
      setError(value instanceof Error ? value.message : '保存文章失败');
    } finally {
      saveInFlightRef.current = false;
    }
  }

  return <section aria-labelledby="generated-article-editor-title" className={`generated-article-editor-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-xl ${embedded ? 'h-full w-full rounded-md border border-slate-200' : 'h-[min(70vh,42rem)] w-full shrink-0 rounded-md border border-slate-200 lg:h-full lg:w-[min(42%,34rem)]'}`}>
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 id="generated-article-editor-title" className="truncate text-sm font-semibold text-slate-800">编辑文章</h2>
        <p className="mt-1 text-xs text-slate-500">{published ? '已发布文章不能原地覆盖，请复制新版本后编辑。' : (dirty ? '有未保存修改' : '所有修改已保存')}</p>
      </div>
      {published && onCopyVersion && <button type="button" onClick={onCopyVersion} disabled={saving} className="shrink-0 rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 disabled:opacity-40">复制为新版本</button>}
      {!published && <button type="button" onClick={() => void save()} disabled={saving || (!dirty && !requiresInitialSave)} aria-label="保存文章" className="task-icon-button shrink-0"><Save className="h-4 w-4" /></button>}
      <button type="button" onClick={() => void close()} disabled={saving} aria-label="关闭文章编辑器" title="关闭文章编辑器" className="task-icon-button shrink-0"><X className="h-4 w-4" /></button>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <label className="grid gap-1 text-xs font-medium text-slate-600">文章标题
        <input ref={titleRef} aria-label="文章标题" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} disabled={published || saving} className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-base font-semibold disabled:bg-slate-50" />
      </label>
      <label className="grid min-h-64 gap-1 text-xs font-medium text-slate-600">文章正文
        <textarea aria-label="文章正文" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} disabled={published || saving} className="min-h-64 w-full resize-none rounded-md border border-slate-300 p-3 text-sm leading-6 disabled:bg-slate-50" />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>文章状态：{draft.status}</span><span>版本：{draft.version || 1}</span><span>来源：{sourceLabel}</span></div>
      {footer}
      {error && <p role="alert" aria-live="assertive" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      {!published && <button type="button" onClick={() => void save()} disabled={saving || (!dirty && !requiresInitialSave)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? '保存中…' : '保存文章'}</button>}
    </div>
  </section>;
}
