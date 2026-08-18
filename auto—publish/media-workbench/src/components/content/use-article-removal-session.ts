import { useCallback, useEffect, useRef, useState } from "react";
import type { ConfirmationOptions } from "../../confirmation";
import { isContentCommandStaleResult } from "../../content-command-result";
import { formatBeijingTime } from "../../time-format";
import type {
  ArticlePermanentDeleteConfirmation,
  ArticleRemovalTransaction,
  ArticleSelection,
  ArticleTrashPreview,
  ArticleTrashRecord,
} from "../../types/publication";
import type {
  ArticleRemovalFeatureSnapshot,
  ArticleRemovalSessionCommands,
} from "./GeneratedArticlesView.types";

export type ArticleRemovalFeedback = {
  kind: "status" | "error";
  text: string;
};

type PendingOperation =
  | "trash_preview"
  | "trash_confirm"
  | "trash_commit"
  | "retry"
  | "restore_confirm"
  | "restore"
  | "permanent_prepare"
  | "permanent_confirm"
  | "permanent_delete";

type SessionState = {
  preview: ArticleTrashPreview | null;
  selections: ArticleSelection[];
  feedback: ArticleRemovalFeedback | null;
  pending: PendingOperation | null;
};

type Request = {
  clientId: string;
  scopeKey: string;
  epoch: number;
};

export type ArticleRemovalSessionSnapshot = {
  preview: ArticleTrashPreview | null;
  feedback: ArticleRemovalFeedback | null;
  transactionId: string | null;
  transaction: ArticleRemovalTransaction | null;
  transactionStatus: string;
  removalSubmitDisabled: boolean;
  busy: boolean;
  trashBusy: boolean;
  retryBusy: boolean;
};

export type ArticleRemovalSessionIntents = {
  previewTrash: (selections: ReadonlyArray<ArticleSelection>) => Promise<void>;
  closePreview: () => void;
  commitTrash: () => Promise<void>;
  retryTransaction: () => Promise<void>;
  restore: (entry: ArticleTrashRecord) => Promise<void>;
  permanentlyDelete: (entry: ArticleTrashRecord) => Promise<void>;
};

export type ArticleRemovalSession = {
  snapshot: ArticleRemovalSessionSnapshot;
  intents: ArticleRemovalSessionIntents;
};

export type ArticleRemovalSessionOptions = ArticleRemovalSessionCommands & {
  clientId: string;
  scopeKey: string;
  removal: ArticleRemovalFeatureSnapshot;
  watchRemovalTransaction: (transactionId: string) => Promise<boolean>;
  commandStates: Record<string, { busy: boolean }>;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  onTrashCommitted: () => void;
};

function initialState(): SessionState {
  return {
    preview: null,
    selections: [],
    feedback: null,
    pending: null,
  };
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}

function transactionIdOf(
  transaction: ArticleRemovalTransaction | null | undefined,
): string | null {
  const value = transaction?.transactionId || transaction?.id;
  return typeof value === "string" && value ? value : null;
}

function transactionStatusOf(
  transaction:
    | Pick<ArticleRemovalTransaction, "status" | "phase">
    | null
    | undefined,
): string {
  if (!transaction) return "";
  if (transaction.status === "pending_recovery")
    return transaction.phase === "needs_repair"
      ? "needs_repair"
      : "pending_auto_recovery";
  return transaction.status;
}

function transactionReason(
  transaction: ArticleRemovalTransaction | null | undefined,
): string {
  return transaction?.reasonCode || transaction?.errorCode || "状态冲突";
}

function transactionFromTrashResult(result: {
  transaction?: ArticleRemovalTransaction | null;
  transactionId?: string;
  status?: string;
  phase?: string | null;
  errorCode?: string;
  reasonCode?: string | null;
  articleCount?: number;
}): ArticleRemovalTransaction | null {
  if (result.transaction) return result.transaction;
  if (!result.transactionId) return null;
  return {
    transactionId: result.transactionId,
    status: result.status || "committed",
    phase: result.phase,
    errorCode: result.errorCode,
    reasonCode: result.reasonCode,
    articleCount: result.articleCount,
  };
}

function hasExistingTransaction(preview: ArticleTrashPreview): boolean {
  return Boolean(
    preview.openTransactionId ||
      preview.transactionId ||
      transactionIdOf(preview.openTransaction) ||
      transactionIdOf(preview.transaction),
  );
}

export function useArticleRemovalSession({
  clientId,
  scopeKey,
  removal,
  watchRemovalTransaction,
  previewContentArticleRemoval,
  trashContentArticles,
  retryContentArticleRemovalTransaction,
  restoreContentArticle,
  preparePermanentDeleteContentArticle,
  permanentlyDeleteContentArticle,
  commandStates,
  confirm,
  onTrashCommitted,
}: ArticleRemovalSessionOptions): ArticleRemovalSession {
  const [state, setState] = useState<SessionState>(() => initialState());
  const mountedRef = useRef(true);
  const clientIdRef = useRef(clientId);
  const scopeKeyRef = useRef(scopeKey);
  const requestEpochRef = useRef(0);
  const pendingRef = useRef<PendingOperation | null>(null);
  clientIdRef.current = clientId;
  scopeKeyRef.current = scopeKey;

  const commandBusy = useCallback(
    (...names: string[]) =>
      names.some((name) => commandStates[name]?.busy === true),
    [commandStates],
  );

  const isCurrent = useCallback((request: Request): boolean => {
    return (
      mountedRef.current &&
      clientIdRef.current === request.clientId &&
      scopeKeyRef.current === request.scopeKey &&
      requestEpochRef.current === request.epoch
    );
  }, []);

  const begin = useCallback(
    (
      pending: PendingOperation,
      clearFeedback = true,
    ): Request | null => {
      if (pendingRef.current !== null) return null;
      const request = {
        clientId,
        scopeKey,
        epoch: requestEpochRef.current + 1,
      };
      requestEpochRef.current = request.epoch;
      pendingRef.current = pending;
      setState((current) => ({
        ...current,
        feedback: clearFeedback ? null : current.feedback,
        pending,
      }));
      return request;
    },
    [clientId, scopeKey],
  );

  const advance = useCallback(
    (request: Request, pending: PendingOperation): Request | null => {
      if (!isCurrent(request)) return null;
      const next = {
        ...request,
        epoch: requestEpochRef.current + 1,
      };
      requestEpochRef.current = next.epoch;
      pendingRef.current = pending;
      setState((current) => ({ ...current, pending }));
      return next;
    },
    [isCurrent],
  );

  const complete = useCallback(
    (
      request: Request,
      update: (current: SessionState) => Partial<SessionState> = () => ({}),
    ): boolean => {
      if (!isCurrent(request)) return false;
      pendingRef.current = null;
      setState((current) => ({
        ...current,
        ...update(current),
        pending: null,
      }));
      return true;
    },
    [isCurrent],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestEpochRef.current += 1;
      pendingRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestEpochRef.current += 1;
    pendingRef.current = null;
    setState(initialState());
  }, [clientId, scopeKey]);

  const executeTrash = useCallback(
    async (
      request: Request,
      preview: ArticleTrashPreview,
      selections: ArticleSelection[],
    ) => {
      try {
        const result = await trashContentArticles({
          selections,
          token: preview.token,
          confirmed: true,
        });
        if (isContentCommandStaleResult(result)) {
          complete(request);
          return;
        }
        if (!isCurrent(request)) return;
        const transaction = transactionFromTrashResult(result);
        const transactionId =
          result.transactionId || transactionIdOf(transaction);
        if (transactionId) {
          await watchRemovalTransaction(transactionId);
          if (!isCurrent(request)) return;
        }
        const status = transactionStatusOf(transaction);
        const articleCount = result.articleCount || selections.length;
        const feedback: ArticleRemovalFeedback =
          status === "pending_auto_recovery" || status === "pending_recovery"
            ? {
                kind: "status",
                text: `已确认移入回收站 ${articleCount} 篇，删除事务正在自动恢复${transaction?.updatedAt ? `（最近更新：${formatBeijingTime(transaction.updatedAt)})` : ""}。`,
              }
            : status === "needs_repair"
              ? {
                  kind: "error",
                  text: `删除事务需要修复：${transactionReason(transaction)}`,
                }
              : {
                  kind: "status",
                  text: `已将 ${articleCount} 篇文章移入回收站；发布记录继续保留，恢复文章不会重新加入投稿队列。`,
                };
        if (
          complete(request, () => ({
            preview: null,
            selections: [],
            feedback,
          }))
        )
          onTrashCommitted();
      } catch (value) {
        complete(request, () => ({
          feedback: {
            kind: "error",
            text: errorMessage(value, "移入回收站失败；未完成的事务可稍后恢复"),
          },
        }));
      }
    },
    [complete, isCurrent, onTrashCommitted, trashContentArticles, watchRemovalTransaction],
  );

  const previewTrash = useCallback(
    async (requestedSelections: ReadonlyArray<ArticleSelection>) => {
      if (!requestedSelections.length || commandBusy("previewContentArticleRemoval"))
        return;
      const request = begin("trash_preview");
      if (!request) return;
      const selections = requestedSelections.map((selection) => ({ ...selection }));
      let activeRequest = request;
      try {
        const preview = await previewContentArticleRemoval({ selections });
        if (isContentCommandStaleResult(preview)) {
          complete(request);
          return;
        }
        if (!isCurrent(request)) return;
        const existingTransaction =
          preview.openTransaction || preview.transaction || null;
        const existingTransactionId =
          preview.openTransactionId ||
          preview.transactionId ||
          transactionIdOf(existingTransaction);
        if (existingTransactionId) {
          await watchRemovalTransaction(existingTransactionId);
          if (!isCurrent(request)) return;
          complete(request, () => ({
            preview,
            selections,
            feedback: {
              kind: "status",
              text: "已存在相同删除事务，正在复用并读取其状态；不会重复创建。",
            },
          }));
          return;
        }
        if (!preview.canCommit) {
          complete(request, () => ({ preview, selections }));
          return;
        }
        const confirmationRequest = advance(activeRequest, "trash_confirm");
        if (!confirmationRequest) return;
        activeRequest = confirmationRequest;
        const accepted = await confirm({
          title: "确认移入回收站",
          message: `将 ${preview.articleCount} 篇文章移入回收站；发布成功的文章不会进入此操作，发布记录会保留。`,
          confirmLabel: "确认移入回收站",
          tone: "danger",
        });
        if (!accepted) {
          complete(confirmationRequest);
          return;
        }
        const commitRequest = advance(activeRequest, "trash_commit");
        if (!commitRequest) return;
        activeRequest = commitRequest;
        await executeTrash(commitRequest, preview, selections);
      } catch (value) {
        complete(activeRequest, () => ({
          feedback: {
            kind: "error",
            text: errorMessage(value, "回收站预检失败"),
          },
        }));
      }
    },
    [
      advance,
      begin,
      commandBusy,
      complete,
      confirm,
      executeTrash,
      isCurrent,
      previewContentArticleRemoval,
      watchRemovalTransaction,
    ],
  );

  const closePreview = useCallback(() => {
    if (pendingRef.current === "trash_commit") return;
    requestEpochRef.current += 1;
    pendingRef.current = null;
    setState((current) => ({
      ...current,
      preview: null,
      selections: [],
      pending: null,
    }));
  }, []);

  const commitTrash = useCallback(async () => {
    const preview = state.preview;
    if (
      !preview ||
      !preview.canCommit ||
      hasExistingTransaction(preview) ||
      commandBusy("trashContentArticles")
    )
      return;
    const transactionStatus = transactionStatusOf(removal.transaction);
    const removalSubmitDisabled = Boolean(
      removal.transactionId &&
        (!removal.transaction ||
          transactionStatus === "pending_auto_recovery" ||
          transactionStatus === "needs_repair"),
    );
    if (removalSubmitDisabled) return;
    const request = begin("trash_commit", false);
    if (!request) return;
    await executeTrash(request, preview, state.selections);
  }, [
    begin,
    commandBusy,
    executeTrash,
    removal.transaction,
    removal.transactionId,
    state.preview,
    state.selections,
  ]);

  const retryTransaction = useCallback(async () => {
    const transactionId = removal.transactionId;
    if (
      !transactionId ||
      commandBusy("retryContentArticleRemovalTransaction")
    )
      return;
    const request = begin("retry");
    if (!request) return;
    try {
      const next = await retryContentArticleRemovalTransaction({ transactionId });
      if (isContentCommandStaleResult(next)) {
        complete(request);
        return;
      }
      if (!isCurrent(request)) return;
      await watchRemovalTransaction(transactionId);
      if (!isCurrent(request)) return;
      const status = transactionStatusOf(next);
      complete(request, () => ({
        feedback:
          status === "needs_repair"
            ? {
                kind: "error",
                text: `删除事务需要修复：${transactionReason(next)}`,
              }
            : {
                kind: "status",
                text: "已提交删除事务修复，正在读取最新状态。",
              },
      }));
    } catch (value) {
      complete(request, () => ({
        feedback: {
          kind: "error",
          text: errorMessage(value, "删除事务修复失败"),
        },
      }));
    }
  }, [
    begin,
    commandBusy,
    complete,
    isCurrent,
    removal.transactionId,
    retryContentArticleRemovalTransaction,
    watchRemovalTransaction,
  ]);

  const restore = useCallback(
    async (entry: ArticleTrashRecord) => {
      if (
        entry.clientId !== clientId ||
        commandBusy("restoreContentArticle")
      )
        return;
      const request = begin("restore_confirm");
      if (!request) return;
      let activeRequest = request;
      try {
        const accepted = await confirm({
          title: "确认恢复文章",
          message: `确认恢复“${entry.titleSnapshot || entry.articleId}”？恢复文章不会重新加入投稿队列。`,
          confirmLabel: "确认恢复",
        });
        if (!accepted) {
          complete(activeRequest);
          return;
        }
        const restoreRequest = advance(activeRequest, "restore");
        if (!restoreRequest) return;
        activeRequest = restoreRequest;
        if (commandBusy("restoreContentArticle")) {
          complete(activeRequest);
          return;
        }
        const result = await restoreContentArticle({
          clientId: entry.clientId,
          articleId: entry.articleId,
        });
        if (isContentCommandStaleResult(result)) {
          complete(activeRequest);
          return;
        }
        complete(activeRequest);
      } catch (value) {
        complete(activeRequest, () => ({
          feedback: {
            kind: "error",
            text: errorMessage(value, "恢复文章失败"),
          },
        }));
      }
    },
    [
      advance,
      begin,
      clientId,
      commandBusy,
      complete,
      confirm,
      restoreContentArticle,
    ],
  );

  const permanentlyDelete = useCallback(
    async (entry: ArticleTrashRecord) => {
      if (
        entry.clientId !== clientId ||
        commandBusy(
          "preparePermanentDeleteContentArticle",
          "permanentlyDeleteContentArticle",
        )
      )
        return;
      const request = begin("permanent_prepare");
      if (!request) return;
      let activeRequest = request;
      let prepared: ArticlePermanentDeleteConfirmation;
      try {
        const preparedResult = await preparePermanentDeleteContentArticle({
          clientId: entry.clientId,
          articleId: entry.articleId,
        });
        if (isContentCommandStaleResult(preparedResult)) {
          complete(request);
          return;
        }
        prepared = preparedResult;
        if (!isCurrent(request)) return;
      } catch (value) {
        complete(activeRequest, () => ({
          feedback: {
            kind: "error",
            text: errorMessage(value, "永久删除预检失败"),
          },
        }));
        return;
      }

      try {
        const confirmationRequest = advance(activeRequest, "permanent_confirm");
        if (!confirmationRequest) return;
        activeRequest = confirmationRequest;
        const accepted = await confirm({
          title: "确认永久删除文章",
          message: `永久删除“${entry.articleId}”？正文和 Markdown 将不可恢复。`,
          confirmLabel: "永久删除",
          tone: "danger",
        });
        if (!accepted) {
          complete(activeRequest);
          return;
        }
        const deleteRequest = advance(
          activeRequest,
          "permanent_delete",
        );
        if (!deleteRequest) return;
        activeRequest = deleteRequest;
        if (commandBusy("permanentlyDeleteContentArticle")) {
          complete(activeRequest);
          return;
        }
        const result = await permanentlyDeleteContentArticle({
          clientId: entry.clientId,
          articleId: entry.articleId,
          token: prepared.token,
        });
        if (isContentCommandStaleResult(result)) {
          complete(activeRequest);
          return;
        }
        complete(activeRequest);
      } catch (value) {
        complete(activeRequest, () => ({
          feedback: {
            kind: "error",
            text: errorMessage(value, "永久删除文章失败"),
          },
        }));
      }
    },
    [
      advance,
      begin,
      clientId,
      commandBusy,
      complete,
      confirm,
      isCurrent,
      permanentlyDeleteContentArticle,
      preparePermanentDeleteContentArticle,
    ],
  );

  const transactionStatus = transactionStatusOf(removal.transaction);
  const removalSubmitDisabled = Boolean(
    removal.transactionId &&
      (!removal.transaction ||
        transactionStatus === "pending_auto_recovery" ||
        transactionStatus === "needs_repair"),
  );
  const busy = state.pending !== null;

  return {
    snapshot: {
      preview: state.preview,
      feedback: state.feedback,
      transactionId: removal.transactionId,
      transaction: removal.transaction,
      transactionStatus,
      removalSubmitDisabled,
      busy,
      trashBusy:
        busy ||
        commandBusy("previewContentArticleRemoval", "trashContentArticles"),
      retryBusy:
        busy || commandBusy("retryContentArticleRemovalTransaction"),
    },
    intents: {
      previewTrash,
      closePreview,
      commitTrash,
      retryTransaction,
      restore,
      permanentlyDelete,
    },
  };
}
