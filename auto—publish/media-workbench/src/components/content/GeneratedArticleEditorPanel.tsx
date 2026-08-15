import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Save, X } from 'lucide-react';
import type { GeneratedContentArticle } from '../../types/generation';
import type { ArticleEditorSnapshot } from '../../bridge/content';
import { useConfirmation } from '../../confirmation';

interface GeneratedArticleEditorPanelProps {
  article: GeneratedContentArticle;
  published?: boolean;
  editable?: boolean;
  editFingerprint?: string | null;
  onSaved: (article: GeneratedContentArticle) => void;
  onEditFingerprintChange?: (fingerprint: string) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onConflict?: () => Promise<ArticleEditorSnapshot | null>;
  onSaveArticle?: (article: GeneratedContentArticle, expectedFingerprint: string) => Promise<GeneratedContentArticle | { article: GeneratedContentArticle; editFingerprint: string }>;
  saving?: boolean;
  footer?: ReactNode;
  embedded?: boolean;
  sourceLabel?: string;
}

export default function GeneratedArticleEditorPanel({ article, published = false, editable = true, editFingerprint, onSaved, onEditFingerprintChange, onClose, onDirtyChange, onConflict, onSaveArticle, saving = false, footer, embedded = false, sourceLabel = '文章库' }: GeneratedArticleEditorPanelProps) {
  const { confirm } = useConfirmation();
  const [draft, setDraft] = useState(article);
  const [base, setBase] = useState(article);
  const [error, setError] = useState('');
  const saveInFlightRef = useRef(false);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dirty = draft.title !== base.title || draft.content !== base.content;
  const canEdit = !published && editable && Boolean(editFingerprint);

  useEffect(() => {
    setDraft(article);
    setBase(article);
    setError('');
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [article]);

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
    if (!canEdit || !dirty || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setError('');
    try {
      if (!onSaveArticle) throw new Error('文章保存命令不可用');
      if (!editFingerprint) throw new Error('文章编辑凭证尚未就绪，请重新打开文章后重试。');
      const result = await onSaveArticle(draft, editFingerprint);
      const saved = 'article' in result ? result.article : result;
      setDraft(saved);
      setBase(saved);
      if ('article' in result && result.editFingerprint) onEditFingerprintChange?.(result.editFingerprint);
      onSaved(saved);
    } catch (value) {
      const code = value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' ? value.code : '';
      if (code === 'ARTICLE_EDIT_CONFLICT' && onConflict) {
        let refreshFailed = false;
        try {
          const refreshed = await onConflict();
          if (refreshed) {
            setDraft(refreshed.article);
            setBase(refreshed.article);
            onEditFingerprintChange?.(refreshed.editFingerprint);
            onSaved(refreshed.article);
          }
        } catch (_) {
          // Keep the conflict visible when the refresh read is unavailable.
          refreshFailed = true;
          setError('保存发生冲突，刷新文章状态失败，请重新打开文章后重试。');
        }
        if (refreshFailed) return;
      }
      setError(value instanceof Error ? value.message : '保存文章失败');
    } finally {
      saveInFlightRef.current = false;
    }
  }

  return <section aria-labelledby="generated-article-editor-title" className={`generated-article-editor-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-xl ${embedded ? 'h-full w-full rounded-md border border-slate-200' : 'h-[min(70vh,42rem)] w-full shrink-0 rounded-md border border-slate-200 lg:h-full lg:w-[min(42%,34rem)]'}`}>
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 id="generated-article-editor-title" className="truncate text-sm font-semibold text-slate-800">编辑文章</h2>
        <p className="mt-1 text-xs text-slate-500">{published ? '已发布文章已有发布成功事实，永久只读。' : !editable ? '文章当前存在未结束的投稿事实，暂不能修改。' : !editFingerprint ? '正在读取文章编辑凭证…' : (dirty ? '有未保存修改' : '所有修改已保存')}</p>
      </div>
      {canEdit && <button type="button" onClick={() => void save()} disabled={saving || !dirty} aria-label="保存文章" className="task-icon-button shrink-0"><Save className="h-4 w-4" /></button>}
      <button type="button" onClick={() => void close()} disabled={saving} aria-label="关闭文章编辑器" title="关闭文章编辑器" className="task-icon-button shrink-0"><X className="h-4 w-4" /></button>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <label className="grid gap-1 text-xs font-medium text-slate-600">文章标题
        <input ref={titleRef} aria-label="文章标题" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} disabled={!canEdit || saving} className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-base font-semibold disabled:bg-slate-50" />
      </label>
      <label className="grid min-h-64 gap-1 text-xs font-medium text-slate-600">文章正文
        <textarea aria-label="文章正文" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} disabled={!canEdit || saving} className="min-h-64 w-full resize-none rounded-md border border-slate-300 p-3 text-sm leading-6 disabled:bg-slate-50" />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>来源：{sourceLabel}</span></div>
      {footer}
      {error && <p role="alert" aria-live="assertive" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      {canEdit && <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? '保存中…' : '保存文章'}</button>}
    </div>
  </section>;
}
