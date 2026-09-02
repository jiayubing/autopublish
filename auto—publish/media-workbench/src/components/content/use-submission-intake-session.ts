import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConfirmationOptions } from "../../confirmation";
import { isContentCommandStaleResult } from "../../content-command-result";
import type { ContentCommandStaleResult } from "../../types/content";
import type {
  ArticleSelection,
  PaidMediaAdmissionResult,
  PaidMediaConfirmationInput,
  PaidMediaPreflight,
  PaidMediaPreflightInput,
  RegularQueueAdmissionInput,
  RegularQueueAdmissionPreview,
  RegularQueueAdmissionResult,
} from "../../types/publication";

export type SubmissionIntakeMode = "regular" | "paid";
export type SubmissionIntakeFeedback = {
  kind: "status" | "error";
  text: string;
};
type PendingOperation =
  | "regular_preview"
  | "regular_admit"
  | "paid_preview"
  | "paid_confirm";

type SessionState = {
  open: boolean;
  mode: SubmissionIntakeMode;
  articleRefs: ArticleSelection[];
  selectionKey: string;
  platformId: string;
  accountProfileId: string;
  mediaResourceId: string;
  paidPreflight: PaidMediaPreflight | null;
  error: string;
  feedback: SubmissionIntakeFeedback | null;
  pending: PendingOperation | null;
};

export type SubmissionIntakeCommandResult<T> =
  | T
  | ContentCommandStaleResult;

export type SubmissionIntakeCommands = {
  previewRegularQueueAdmission: (
    input: RegularQueueAdmissionInput,
  ) => Promise<SubmissionIntakeCommandResult<RegularQueueAdmissionPreview>>;
  admitRegularQueueItems: (
    input: RegularQueueAdmissionInput,
  ) => Promise<SubmissionIntakeCommandResult<RegularQueueAdmissionResult>>;
  startRegularQueueGroup: (input: {
    queueGroupId: string;
  }) => Promise<SubmissionIntakeCommandResult<unknown>>;
  previewPaidMediaPreflight: (
    input: PaidMediaPreflightInput,
  ) => Promise<SubmissionIntakeCommandResult<PaidMediaPreflight>>;
  confirmPaidMediaBatch: (
    input: PaidMediaConfirmationInput,
  ) => Promise<SubmissionIntakeCommandResult<PaidMediaAdmissionResult>>;
};

export type SubmissionIntakeSnapshot = {
  open: boolean;
  mode: SubmissionIntakeMode;
  articleCount: number;
  platformId: string;
  accountProfileId: string;
  mediaResourceId: string;
  paidPreflight: PaidMediaPreflight | null;
  error: string;
  feedback: SubmissionIntakeFeedback | null;
  regularBusy: boolean;
  paidPreviewBusy: boolean;
  paidConfirmBusy: boolean;
  mutationBusy: boolean;
};

export type SubmissionIntakeIntents = {
  open: (articleRefs: ReadonlyArray<ArticleSelection>) => void;
  close: () => void;
  setMode: (mode: SubmissionIntakeMode) => void;
  setRegularPlatform: (platformId: string) => void;
  setAccountProfile: (accountProfileId: string) => void;
  setMediaResource: (mediaResourceId: string) => void;
  closePaidPreflight: () => void;
  submitRegular: () => Promise<void>;
  previewPaid: () => Promise<void>;
  confirmPaid: () => Promise<void>;
};

export type SubmissionIntakeSession = {
  snapshot: SubmissionIntakeSnapshot;
  intents: SubmissionIntakeIntents;
};

export type SubmissionIntakeSessionOptions = SubmissionIntakeCommands & {
  scopeKey: string;
  availableArticleRefs: ReadonlyArray<ArticleSelection>;
  commandStates: Record<string, { busy: boolean }>;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  onCommitted: () => void;
};

function initialState(
  feedback: SubmissionIntakeFeedback | null = null,
): SessionState {
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

function keyOf(articleRefs: ReadonlyArray<ArticleSelection>): string {
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
  previewRegularQueueAdmission,
  admitRegularQueueItems,
  startRegularQueueGroup,
  previewPaidMediaPreflight,
  confirmPaidMediaBatch,
  commandStates,
  confirm,
  onCommitted,
}: SubmissionIntakeSessionOptions): SubmissionIntakeSession {
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
    (articleRefs: ReadonlyArray<ArticleSelection>) => {
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
    (mode: SubmissionIntakeMode) => {
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

  async function submitRegular() {
    if (
      !state.open ||
      !state.articleRefs.length ||
      !state.platformId ||
      !state.accountProfileId ||
      pendingRef.current !== null ||
      commandBusy(
        "previewRegularQueueAdmission",
        "admitRegularQueueItems",
        "startRegularQueueGroup",
      )
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
      const preview = await previewRegularQueueAdmission(input);
      if (!isCurrent(requestedScope, epoch)) return;
      if (isContentCommandStaleResult(preview)) {
        pendingRef.current = null;
        setState((current) => ({ ...current, pending: null }));
        return;
      }
      if (!preview.queueableCount && !preview.idempotentCount)
        throw new Error("没有符合普通平台队列规则的文章");
      const resumableQueueGroupIds = [
        ...new Set(
          preview.items
            .filter(
              (item) =>
                item.status === "idempotent" &&
                item.reasonCode === "REGULAR_CLIENT_PROFILE_INCOMPLETE" &&
                Boolean(item.queueGroupId),
            )
            .map((item) => item.queueGroupId as string),
        ),
      ];
      const accepted = await confirm({
        title: "确认发起普通平台投稿",
        message: `将新增 ${preview.queueableCount} 项普通平台投稿，已存在跳过 ${preview.idempotentCount} 项，缺失 ${preview.missingCount} 项，冲突 ${preview.conflictCount} 项。${resumableQueueGroupIds.length ? ` 其中 ${resumableQueueGroupIds.length} 个因客户资料不完整而暂停的已有队列将重新启动。` : ""}`,
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
      const result = await admitRegularQueueItems(input);
      if (!isCurrent(requestedScope, epoch)) return;
      if (isContentCommandStaleResult(result)) {
        pendingRef.current = null;
        setState((current) => ({ ...current, pending: null }));
        return;
      }
      let resumedCount = 0;
      for (const queueGroupId of resumableQueueGroupIds) {
        const stillQueued = result.items.some(
          (item) =>
            item.status === "idempotent" &&
            item.queueGroupId === queueGroupId,
        );
        if (!stillQueued) continue;
        const resumed = await startRegularQueueGroup({ queueGroupId });
        if (!isCurrent(requestedScope, epoch)) return;
        if (isContentCommandStaleResult(resumed)) {
          pendingRef.current = null;
          setState((current) => ({ ...current, pending: null }));
          return;
        }
        resumedCount += 1;
      }
      pendingRef.current = null;
      setState(
        initialState({
          kind: "status",
          text: resumedCount
            ? `已发起 ${result.admittedCount || 0} 项普通平台投稿，并重新启动 ${resumedCount} 个因客户资料不完整而暂停的队列。`
            : `已发起 ${result.admittedCount || 0} 项普通平台投稿。`,
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
  }

  async function previewPaid() {
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
      const result = await previewPaidMediaPreflight({
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
        paidPreflight: result,
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
  }

  async function confirmPaid() {
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
      const result = await confirmPaidMediaBatch({ confirmationToken });
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
  }

  return {
    snapshot: {
      ...state,
      articleCount: state.articleRefs.length,
      regularBusy:
        state.pending === "regular_preview" ||
        state.pending === "regular_admit" ||
        commandBusy(
          "previewRegularQueueAdmission",
          "admitRegularQueueItems",
          "startRegularQueueGroup",
        ),
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
