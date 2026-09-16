import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Save, Search, X } from 'lucide-react';
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
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const matches = useMemo(() => {
    if (!searchText) return [];
    const result: Array<{ field: 'title' | 'content'; start: number; end: number }> = [];
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const field of ['title', 'content'] as const) {
      for (const match of draft[field].matchAll(new RegExp(escaped, 'gi'))) {
        result.push({ field, start: match.index!, end: match.index! + match[0].length });
      }
    }
    return result;
  }, [searchText, draft.title, draft.content]);

  useEffect(() => { setMatchIndex(-1); }, [matches]);

  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => { searchRef.current?.focus(); searchRef.current?.select(); });
  }

  function findMatch(direction: number) {
    if (!matches.length) return;
    const index = matchIndex < 0 ? (direction > 0 ? 0 : matches.length - 1)
      : (matchIndex + direction + matches.length) % matches.length;
    const match = matches[index];
    const input = match.field === 'title' ? titleRef.current : bodyRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(match.start, match.end);
    if (input instanceof HTMLTextAreaElement) {
      const mirror = document.createElement('div');
      const style = getComputedStyle(input);
      mirror.style.cssText = 'position:fixed;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;';
      for (const property of ['font', 'letter-spacing', 'line-height', 'padding', 'border', 'box-sizing'])
        mirror.style.setProperty(property, style.getPropertyValue(property));
      mirror.style.width = `${input.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
      mirror.textContent = input.value.slice(0, match.start);
      const marker = document.createElement('span');
      marker.textContent = input.value.slice(match.start, match.end) || ' ';
      mirror.append(marker);
      document.body.append(mirror);
      input.scrollTop = Math.max(0, marker.offsetTop - input.clientHeight / 2);
      mirror.remove();
    }
    setMatchIndex(index);
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const dirty = draft.title !== base.title || draft.content !== base.content;
  const canEdit = !published && editable && Boolean(editFingerprint);

  useEffect(() => {
    setDraft(article);
    setBase(article);
    setError('');
    setSearchOpen(false);
    setSearchText('');
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [article]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
        return;
      }
      const activeMatch = matches[matchIndex];
      const matchedInput = activeMatch?.field === 'title' ? titleRef.current : bodyRef.current;
      if (searchOpen && activeMatch && event.key === 'Enter' && !event.isComposing &&
          event.target === matchedInput && matchedInput?.selectionStart === activeMatch.start &&
          matchedInput.selectionEnd === activeMatch.end) {
        event.preventDefault();
        findMatch(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (searchOpen) { setSearchOpen(false); titleRef.current?.focus(); return; }
        void close();
        return;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dirty, searchOpen, matches, matchIndex]);

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
      <button type="button" onClick={openSearch} aria-label="搜索文章" title="搜索文章 (Ctrl+F)" className="task-icon-button shrink-0"><Search className="h-4 w-4" /></button>
      <button type="button" onClick={() => void close()} disabled={saving} aria-label="关闭文章编辑器" title="关闭文章编辑器" className="task-icon-button shrink-0"><X className="h-4 w-4" /></button>
    </div>
    {searchOpen && <div role="search" aria-label="文章内搜索" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs">
      <input ref={searchRef} aria-label="搜索文章内容" placeholder="搜索标题和正文" value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); findMatch(event.shiftKey ? -1 : 1); }
      }} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1" />
      <span role="status">{searchText ? (matches.length ? `${matchIndex + 1} / ${matches.length}` : '无匹配') : '输入关键词'}</span>
      <button type="button" disabled={!matches.length} onClick={() => findMatch(-1)} aria-label="上一处匹配" className="disabled:opacity-40">上一处</button>
      <button type="button" disabled={!matches.length} onClick={() => findMatch(1)} aria-label="下一处匹配" className="disabled:opacity-40">下一处</button>
      <button type="button" onClick={() => { setSearchOpen(false); titleRef.current?.focus(); }} aria-label="关闭文章搜索"><X className="h-4 w-4" /></button>
    </div>}
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <label className="grid gap-1 text-xs font-medium text-slate-600">文章标题
        <input ref={titleRef} aria-label="文章标题" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} readOnly={!canEdit || saving} className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-base font-semibold read-only:bg-slate-50 selection:bg-amber-300 selection:text-slate-950" />
      </label>
      <label className="grid min-h-64 gap-1 text-xs font-medium text-slate-600">文章正文
        <textarea ref={bodyRef} aria-label="文章正文" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} readOnly={!canEdit || saving} className="min-h-64 w-full resize-none rounded-md border border-slate-300 p-3 text-sm leading-6 read-only:bg-slate-50 selection:bg-amber-300 selection:text-slate-950" />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>来源：{sourceLabel}</span></div>
      {footer}
      {error && <p role="alert" aria-live="assertive" className="rounded border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      {canEdit && <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? '保存中…' : '保存文章'}</button>}
    </div>
  </section>;
}

