import React, { useEffect, useRef } from 'react';

export interface ActionConfirmation {
  id: number;
  clientId?: string;
  kind: string;
  title: string;
  message: string;
  confirmLabel?: string;
}

interface ActionConfirmationModalProps {
  pending: ActionConfirmation | null;
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A content-area confirmation: it deliberately never covers the global client selector. */
export default function ActionConfirmationModal({ pending, submitting = false, onConfirm, onCancel }: ActionConfirmationModalProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) { event.preventDefault(); onCancel(); }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onCancel, pending, submitting]);
  if (!pending) return null;
  return <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-slate-900/20 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby={`confirmation-${pending.id}`} className="my-4 w-full max-w-lg rounded-md border border-slate-200 bg-white p-4 shadow-xl">
      <h2 id={`confirmation-${pending.id}`} className="text-base font-semibold text-slate-800">{pending.title}</h2>
      <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-600">{pending.message}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={submitting} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">取消</button>
        <button type="button" onClick={onConfirm} disabled={submitting} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{submitting ? '处理中…' : pending.confirmLabel || '确认'}</button>
      </div>
    </section>
  </div>;
}
