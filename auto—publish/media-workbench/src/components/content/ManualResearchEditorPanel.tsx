import React, { useEffect, useRef } from 'react';
import { Save, X } from 'lucide-react';
import { ManualAnswerDraft, ManualAnswerSession } from '../../content-question-editor-session';

interface ManualResearchEditorPanelProps {
  session: ManualAnswerSession;
  draft: ManualAnswerDraft;
  questionText: string;
  clientName: string;
  saving: boolean;
  onDraftChange: (draft: ManualAnswerDraft) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function ManualResearchEditorPanel({ session, draft, questionText, clientName, saving, onDraftChange, onSave, onClose }: ManualResearchEditorPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => answerRef.current?.focus());
  }, [session.sessionId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current || window.matchMedia('(min-width: 768px)').matches) return;
      const focusable: HTMLElement[] = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')) as HTMLElement[];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function update(patch: Partial<ManualAnswerDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  return <>
    <button type="button" aria-label="关闭人工回答编辑器遮罩" className="manual-research-editor-backdrop" onClick={onClose} />
    <section ref={panelRef} role="dialog" aria-modal="false" aria-labelledby="manual-research-editor-title" className="manual-research-editor-panel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="manual-research-editor-title" className="truncate text-sm font-semibold text-slate-800">人工编辑回答 · {clientName}</h2>
          <p className="mt-1 truncate text-xs text-slate-500">{questionText}</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="关闭人工回答编辑器" title="关闭人工回答编辑器" className="task-icon-button shrink-0"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <label className="grid gap-1 text-xs font-medium text-slate-600">回答正文
          <textarea ref={answerRef} value={draft.answerText} onChange={(event) => update({ answerText: event.target.value })} disabled={saving} className="min-h-40 w-full rounded-md border border-slate-300 p-2 text-sm disabled:bg-slate-50" placeholder="回答正文（至少 10 个字符）" />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-slate-600">引用标题<input value={draft.referenceTitle} onChange={(event) => update({ referenceTitle: event.target.value })} disabled={saving} placeholder="引用标题" className="h-9 rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-50" /></label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">引用 URL<input value={draft.referenceUrl} onChange={(event) => update({ referenceUrl: event.target.value })} disabled={saving} placeholder="https:// 引用 URL" className="h-9 rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-50" /></label>
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button type="button" onClick={onClose} disabled={saving} className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">取消</button>
        <button type="button" onClick={onSave} disabled={saving || !draft.answerText.trim()} className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? '保存中…' : '保存人工回答'}</button>
      </div>
    </section>
  </>;
}

