export interface ManualAnswerSession {
  clientId: string;
  questionId: string;
  sessionId: string;
}

export interface ManualAnswerDraft {
  answerText: string;
  referenceTitle: string;
  referenceUrl: string;
}

export function createManualAnswerSession(clientId: string, questionId: string, sessionId: string): ManualAnswerSession {
  if (!clientId || !questionId || !sessionId) throw new Error('Manual answer session identity is required');
  return { clientId, questionId, sessionId };
}

export function sameManualAnswerSession(left: ManualAnswerSession | null | undefined, right: ManualAnswerSession | null | undefined): boolean {
  return Boolean(left && right && left.clientId === right.clientId && left.questionId === right.questionId && left.sessionId === right.sessionId);
}

export function manualAnswerDraftDirty(base: ManualAnswerDraft, draft: ManualAnswerDraft): boolean {
  return base.answerText !== draft.answerText || base.referenceTitle !== draft.referenceTitle || base.referenceUrl !== draft.referenceUrl;
}
