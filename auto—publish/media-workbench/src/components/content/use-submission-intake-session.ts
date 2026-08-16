import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConfirmationOptions } from "../../confirmation";
import { isContentCommandStaleResult } from "../../content-command-result";
import type { PaidMediaPreflight } from "../../types/publication";
import type { GeneratedArticlesCommands } from "./GeneratedArticlesView.types";

type ArticleRef = { clientId: string; articleId: string };
type IntakeMode = "regular" | "paid";
type Feedback = { kind: "status" | "error"; text: string };
type PendingOperation =
  | "regular_preview"
  | "regular_admit"
  | "paid_preview"
  | "paid_confirm";

type SessionState = {
  open: boolean;
  mode: IntakeMode;
  articleRefs: ArticleRef[];
  selectionKey: string;
  platformId: string;
  accountProfileId: string;
  mediaResourceId: string;
  paidPreflight: PaidMediaPreflight | null;
  error: string;
  feedback: Feedback | null;
  pending: PendingOperation | null;
};

function initialState(feedback: Feedback | null = null): SessionState {
  return {
    open: false,
    mode: "regular",
    articleRefs: [],
    selectionKey: "",
    platformId: "",
    accountProfileId: "",
    mediaResourceId: "",
    paidPreflight: null,
    error: "",
    feedback,
    pending: null,
  };
}

function keyOf(articleRefs: ArticleRef[]): string {
  return articleRefs
    .map((article) => `${article.clientId}:${article.articleId}`)
    .sort()
    .join("|");
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}

export function useSubmissionIntakeSession({
  scopeKey,
  availableArticleRefs,
  commands,
  commandStates,
  confirm,
  onCommitted,
}: {
  scopeKey: string;
  availableArticleRefs: ArticleRef[];
  commands: GeneratedArticlesCommands;
  commandStates: Record<string, { busy: boolean }>;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  onCommitted: () => void;
}) {
  const [state, setState] = useState<SessionState>(() => initialState());
  const mountedRef = useRef(true);
  const scopeRef = useRef(scopeKey);
  const requestEpochRef = useRef(0);
  const pendingRef = useRef<PendingOperation | null>(null);
  const availableSelectionKey = useMemo(
    () => keyOf(availableArticleRefs),
    [availableArticleRefs],
  );
  scopeRef.current = scopeKey;

  const invalidateAsync = useCallback(() => {
    requestEpochRef.current += 1;
    pendingRef.current = null;
  }, []);

  const mutationPending = useCallback(() => {
    return (
      pendingRef.current === "regular_admit" ||
      pendingRef.current === "paid_confirm"
    );
  }, []);

  const isCurrent = useCallback((requestedScope: string, epoch: number) => {
    return (
      mountedRef.current &&
      scopeRef.current === requestedScope &&
      requestEpochRef.current === epoch
    );
  }, []);

  const commandBusy = useCallback(
    (...names: string[]) =>
      names.some((name) => commandStates[name]?.busy === true),
    [commandStates],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestEpochRef.current += 1;
    };
  }, []);

  useEffect(() => {
    invalidateAsync();
    setState(initialState());
  }, [scopeKey, invalidateAsync]);

  useEffect(() => {
    if (
      !state.open ||
      mutationPending() ||
      state.selectionKey === availableSelectionKey
    )
      return;
    invalidateAsync();
    setState(initialState(state.feedback));
  }, [
    availableSelectionKey,
    invalidateAsync,
    mutationPending,
    state.feedback,
    state.open,
    state.selectionKey,
  ]);

  const open = useCallback(
    (articleRefs: ArticleRef[]) => {
      if (!articleRefs.length || mutationPending()) return;
      invalidateAsync();
      setState({
        ...initialState(),
        open: true,
        articleRefs: articleRefs.map((article) => ({ ...article })),
        selectionKey: keyOf(articleRefs),
      });
    },
    [invalidateAsync, mutationPending],
  );

  const close = useCallback(() => {
    if (mutationPending()) return;
    invalidateAsync();
    setState((current) => initialState(current.feedback));
  }, [invalidateAsync, mutationPending]);

  const setMode = useCallback(
    (mode: IntakeMode) => {
      if (mutationPending()) return;
      invalidateAsync();
      setState((current) => ({
        ...current,
        mode,
        paidPreflight: null,
        error: "",
        pending: null,
      }));
    },
    [invalidateAsync, mutationPending],
  );

  const setRegularPlatform = useCallback(
    (platformId: string) => {
      if (mutationPending()) return;
      invalidateAsync();
      setState((current) => ({
        ...current,
        platformId,
        accountProfileId: "",
        error: "",
        pending: null,
      }));
    },
    [invalidateAsync, mutationPending],
  );

  const setAccountProfile = useCallback(
    (accountProfileId: string) => {
      if (mutationPending()) return;
      invalidateAsync();
      setState((current) => ({
        ...current,
        accountProfileId,
        error: "",
        pending: null,
      }));
    },
    [invalidateAsync, mutationPending],
  );

  const setMediaResource = useCallback(
    (mediaResourceId: string) => {
      if (mutationPending()) return;
      invalidateAsync();
      setState((current) => ({
        ...current,
        mediaResourceId,
        paidPreflight: null,
        error: "",
        pending: null,
      }));
    },
    [invalidateAsync, mutationPending],
  );

  const closePaidPreflight = useCallback(() => {
    if (mutationPending()) return;
    invalidateAsync();
    setState((current) => ({
      ...current,
      paidPreflight: null,
      error: "",
      pending: null,
    }));
  }, [invalidateAsync, mutationPending]);

  const submitRegular = useCallback(async () => {
    if (
      !state.open ||
      !state.articleRefs.length ||
      !state.platformId ||
      !state.accountProfileId ||
      pendingRef.current !== null ||
      commandBusy("previewRegularQueueAdmission", "admitRegularQueueItems")
    )
      return;
    const requestedScope = scopeKey;
    const epoch = requestEpochRef.current + 1;
    requestEpochRef.current = epoch;
    pendingRef.current = "regular_preview";
    setState((current) => ({
      ...current,
      error: "",
      pending: "regular_preview",
    }));
    const input = {
      articleRefs: state.articleRefs,
      platformId: state.platformId,
      accountProfileId: state.accountProfileId,
    };
    try {
      const preview = await commands.previewRegularQueueAdmission(input);
      if (!isCurrent(requestedScope, epoch)) return;
      if (isContentCommandStaleResult(preview)) {
        pendingRef.current = null;
        setState((current) => ({ ...current, pending: null }));
        return;
      }
      if (!preview.queueableCount && !preview.idempotentCount)
        throw new Error("没有符合普通平台队列规则的文章");
      const accepted = await confirm({
        title: "确认发起普通平台投稿",
        message: `将新增 ${preview.queueableCount} 项普通平台投稿，已存在跳过 ${preview.idempotentCount} 项，缺失 ${preview.missingCount} 项，冲突 ${preview.conflictCount} 项。`,
        confirmLabel: "确认发起投稿",
      });
      if (!isCurrent(requestedScope, epoch)) return;
      if (!accepted) {
        pendingRef.current = null;
        setState((current) => ({ ...current, pending: null }));
        return;
      }
      pendingRef.current = "regular_admit";
      setState((current) => ({ ...current, pending: "regular_admit" }));
      const result = await commands.admitRegularQueueItems(input);
      if (!isCurrent(requestedScope, epoch)) return;
      if (isContentCommandStaleResult(result)) {
        pendingRef.current = null;
        setState((current) => ({ ...current, pending: null }));
        return;
      }
      pendingRef.current = null;
      setState(
        initialState({
          kind: "status",
          text: `已发起 ${result.admittedCount || 0} 项普通平台投稿。`,
        }),
      );
      onCommitted();
    } catch (value) {
      if (!isCurrent(requestedScope, epoch)) return;
      pendingRef.current = null;
      setState((current) => ({
        ...current,
        error: errorMessage(value, "发起普通平台投稿失败"),
        pending: null,
      }));
    }
  }, [commandBusy, commands, confirm, isCurrent, onCommitted, scopeKey, state]);

  const previewPaid = useCallback(async () => {
    if (
      !state.open ||
      !state.articleRefs.length ||
      !state.mediaResourceId ||
      pendingRef.current !== null ||
      commandBusy("previewPaidMediaPreflight")
    )
      return;
    const requestedScope = scopeKey;
    const epoch = requestEpochRef.current + 1;
    requestEpochRef.current = epoch;
    pendingRef.current = "paid_preview";
    setState((current) => ({
      ...current,
      error: "",
      pending: "paid_preview",
    }));
    try {
      const result = await commands.previewPaidMediaPreflight({
        articleRefs: state.articleRefs,
        mediaResourceId: state.mediaResourceId,
      });
      if (!isCurrent(requestedScope, epoch)) return;
      if (isContentCommandStaleResult(result)) {
        pendingRef.current = null;
        setState((current) => ({ ...current, pending: null }));
        return;
      }
      pendingRef.current = null;
      setState((current) => ({
        ...current,
        paidPreflight: result as PaidMediaPreflight,
        pending: null,
      }));
    } catch (value) {
      if (!isCurrent(requestedScope, epoch)) return;
      pendingRef.current = null;
      setState((current) => ({
        ...current,
        error: errorMessage(value, "付费媒体预检失败"),
        pending: null,
      }));
    }
  }, [commandBusy, commands, isCurrent, scopeKey, state]);

  const confirmPaid = useCallback(async () => {
    const confirmationToken = state.paidPreflight?.confirmationToken;
    if (
      !confirmationToken ||
      pendingRef.current !== null ||
      commandBusy("confirmPaidMediaBatch")
    )
      return;
    const requestedScope = scopeKey;
    const epoch = requestEpochRef.current + 1;
    requestEpochRef.current = epoch;
    pendingRef.current = "paid_confirm";
    const articleCount = state.articleRefs.length;
    setState((current) => ({
      ...current,
      error: "",
      pending: "paid_confirm",
    }));
    try {
      const result = await commands.confirmPaidMediaBatch({ confirmationToken });
      if (!isCurrent(requestedScope, epoch)) return;
      if (isContentCommandStaleResult(result)) {
        pendingRef.current = null;
        setState((current) => ({ ...current, pending: null }));
        return;
      }
      pendingRef.current = null;
      setState(
        initialState({
          kind: "status",
          text: `已确认 ${result.articleCount || articleCount} 篇文章进入付费投稿批次。`,
        }),
      );
      onCommitted();
    } catch (value) {
      if (!isCurrent(requestedScope, epoch)) return;
      pendingRef.current = null;
      setState((current) => ({
        ...current,
        error: errorMessage(value, "确认付费投稿失败"),
        pending: null,
      }));
    }
  }, [commandBusy, commands, isCurrent, onCommitted, scopeKey, state.articleRefs.length, state.paidPreflight]);

  return {
    snapshot: {
      ...state,
      articleCount: state.articleRefs.length,
      regularBusy:
        state.pending === "regular_preview" ||
        state.pending === "regular_admit" ||
        commandBusy("previewRegularQueueAdmission", "admitRegularQueueItems"),
      paidPreviewBusy:
        state.pending === "paid_preview" ||
        commandBusy("previewPaidMediaPreflight"),
      paidConfirmBusy:
        state.pending === "paid_confirm" ||
        commandBusy("confirmPaidMediaBatch"),
      mutationBusy:
        state.pending === "regular_admit" || state.pending === "paid_confirm",
    },
    intents: {
      open,
      close,
      setMode,
      setRegularPlatform,
      setAccountProfile,
      setMediaResource,
      closePaidPreflight,
      submitRegular,
      previewPaid,
      confirmPaid,
    },
  };
}
