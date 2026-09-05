import React, { useMemo } from 'react';
import type { ContentQuestion, ContentResearch } from '../../types/content';
import { formatBeijingTime } from '../../time-format';
import CollapsibleSourceItem from './CollapsibleSourceItem';
import { Check, MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import type { ManualAnswerSession } from '../../content-question-editor-session';

interface QuestionResearchListProps {
  questions: ContentQuestion[];
  research: ContentResearch[];
  manualAnswerSession: ManualAnswerSession | null;
  manualSourceRef: React.MutableRefObject<HTMLButtonElement | null>;
  isCollecting: boolean;
  onToggle: (question: ContentQuestion) => void;
  onEdit: (question: ContentQuestion) => void;
  onManualAnswer: (question: ContentQuestion, research: ContentResearch | undefined, source: HTMLButtonElement) => void;
  onCollect: (question: ContentQuestion) => void;
  onRecollect: (question: ContentQuestion) => void;
  onDelete: (question: ContentQuestion) => void;
}

export default function QuestionResearchList({ questions, research, manualAnswerSession, manualSourceRef, isCollecting, onToggle, onEdit, onManualAnswer, onCollect, onRecollect, onDelete }: QuestionResearchListProps) {
  const researchById = useMemo(() => new Map(research.map((item) => [item.id, item])), [research]);
  return <div className="space-y-2">{questions.map((question) => {
    const item = researchById.get(question.id);
    const summary = item ? `${item.isAnswerComplete === false ? '未完成' : '已完成'} · ${item.answerText?.length || 0} 字 · ${item.collectionMethod} · ${formatBeijingTime(item.collectedAt || item.updatedAt)}` : '尚未采集';
    const actions = <><button type="button" onClick={() => onEdit(question)} title="编辑问题" className="task-icon-button"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`人工回答：${question.text}`} ref={(element) => { if (element && manualAnswerSession?.questionId === question.id) manualSourceRef.current = element; }} onClick={(event) => onManualAnswer(question, item, event.currentTarget)} title="人工回答" className="task-icon-button"><MessageSquareText className="h-4 w-4" /></button><button type="button" disabled={isCollecting} onClick={() => onCollect(question)} title="单条采集" className="task-icon-button"><Check className="h-4 w-4" /></button><button type="button" disabled={isCollecting} onClick={() => onRecollect(question)} title="明确重新采集" className="task-icon-button"><span className="text-xs">重采</span></button><button type="button" onClick={() => onDelete(question)} title="删除问题" className="task-icon-button text-rose-600"><Trash2 className="h-4 w-4" /></button></>;
    return <div key={question.id}><CollapsibleSourceItem id={question.id} title={question.text} summary={summary} selected={question.enabled} onSelectedChange={() => onToggle(question)} defaultExpanded={false} actions={actions}>
      {item ? <div className="grid gap-2"><div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{item.answerText}</div><div>{item.references.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="mr-2 text-blue-600 underline">{reference.title}</a>)}</div></div> : <div className="text-slate-400">尚未采集回答</div>}
    </CollapsibleSourceItem></div>;
  })}</div>;
}

