import React, { useEffect, useRef, useState } from "react";
import { LogIn, RefreshCw, Save } from "lucide-react";
import type {
  ContentClient,
  ContentCommandStaleResult,
  ContentQuestion,
  ContentResearch,
  DoubaoBatchMode,
  DoubaoBatchPreview,
  DoubaoLoginState,
  DoubaoQueueState,
} from "../../types/content";
import CollectionTaskBar from "./CollectionTaskBar";
import ManualResearchEditorPanel from "./ManualResearchEditorPanel";
import QuestionBatchControls from "./QuestionBatchControls";
import type { ClientGrouping } from "./ClientSelector";
import QuestionResearchList from "./QuestionResearchList";
import {
  createManualAnswerSession,
  manualAnswerDraftDirty,
  type ManualAnswerDraft,
  type ManualAnswerSession,
  sameManualAnswerSession,
} from "../../content-question-editor-session";
import { useConfirmation } from "../../confirmation";
import { Button, StatusBadge, Surface } from "../ui/primitives";

interface QuestionCollectionViewProps {
  clients: ContentClient[];
  grouping?: ClientGrouping;
  clientId: string;
  questions: ContentQuestion[];
  research: ContentResearch[];
  query: { loading: boolean; error?: { userMessage?: string } | null };
  commands: {
    createQuestion: (input: Record<string, unknown>) => Promise<unknown>;
    updateQuestion: (input: Record<string, unknown>) => Promise<unknown>;
    deleteQuestion: (input: Record<string, unknown>) => Promise<unknown>;
    saveManualResearch: (input: Record<string, unknown>) => Promise<unknown>;
    collectDoubaoQuestion: (input: Record<string, unknown>) => Promise<unknown>;
    startPreparedDoubaoBatch: (
      input: Record<string, unknown>,
    ) => Promise<DoubaoQueueState | ContentCommandStaleResult>;
    pauseDoubaoBatch: () => Promise<DoubaoQueueState>;
    resumeDoubaoBatch: () => Promise<DoubaoQueueState>;
    stopDoubaoBatch: () => Promise<DoubaoQueueState>;
    retryFailedDoubao: () => Promise<DoubaoQueueState>;
    getDoubaoLoginStatus: () => Promise<DoubaoLoginState>;
    openDoubaoLogin: () => Promise<DoubaoLoginState>;
    previewDoubaoBatch: (input: {
      clientIds: string[];
      mode: DoubaoBatchMode;
    }) => Promise<DoubaoBatchPreview | ContentCommandStaleResult>;
  };
  commandStates: {
    saveManualResearch: {
      busy: boolean;
      error?: { userMessage?: string } | null;
    };
    collectDoubaoQuestion: { busy: boolean };
    previewDoubaoBatch: { busy: boolean };
    startPreparedDoubaoBatch: { busy: boolean };
    pauseDoubaoBatch: { busy: boolean };
    resumeDoubaoBatch: { busy: boolean };
    stopDoubaoBatch: { busy: boolean };
    retryFailedDoubao: { busy: boolean };
  };
  queue: DoubaoQueueState;
  login: DoubaoLoginState;
  queueQuery: { loading: boolean; error?: { userMessage?: string } | null };
  loginQuery: { loading: boolean; error?: { userMessage?: string } | null };
}

function loginTone(status: DoubaoLoginState["status"]) {
  return status === "logged_in"
    ? ("success" as const)
    : status === "not_logged_in"
      ? ("warning" as const)
      : ("neutral" as const);
}

export default function QuestionCollectionView({
  clients,
  grouping,
  clientId,
  questions,
  research,
  query,
  commands,
  commandStates,
  queue,
  login,
  queueQuery,
  loginQuery,
}: QuestionCollectionViewProps) {
  const { confirm } = useConfirmation();
  const [questionDraftId, setQuestionDraftId] = useState<string | null>(null);
  const [questionDraftText, setQuestionDraftText] = useState("");
  const [manualAnswerSession, setManualAnswerSession] =
    useState<ManualAnswerSession | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualAnswerDraft>({
    answerText: "",
    referenceTitle: "",
    referenceUrl: "",
  });
  const manualSaving = commandStates.saveManualResearch.busy;
  const [error, setError] = useState("");
  const manualSessionRef = useRef<ManualAnswerSession | null>(null);
  const manualBaseDraftRef = useRef<ManualAnswerDraft>({
    answerText: "",
    referenceTitle: "",
    referenceUrl: "",
  });
  const manualSourceRef = useRef<HTMLButtonElement | null>(null);
  const sessionTokenSequence = useRef(0);

  manualSessionRef.current = manualAnswerSession;

  const selectedQuestionCount = questions.filter((item) => item.enabled).length;
  const activeQueueStatus = (status: DoubaoQueueState["status"]) =>
    status === "running" || status === "paused" || status === "stopping";
  const collectionPending =
    commandStates.collectDoubaoQuestion.busy ||
    commandStates.previewDoubaoBatch.busy ||
    commandStates.startPreparedDoubaoBatch.busy ||
    commandStates.pauseDoubaoBatch.busy ||
    commandStates.resumeDoubaoBatch.busy ||
    commandStates.stopDoubaoBatch.busy ||
    commandStates.retryFailedDoubao.busy;
  const isCollecting = collectionPending || activeQueueStatus(queue.status);

  useEffect(() => {
    manualSessionRef.current = null;
    setManualAnswerSession(null);
    setManualDraft({
      answerText: "",
      referenceTitle: "",
      referenceUrl: "",
    });
    manualBaseDraftRef.current = {
      answerText: "",
      referenceTitle: "",
      referenceUrl: "",
    };
    manualSourceRef.current = null;
    setQuestionDraftId(null);
    setQuestionDraftText("");
  }, [clientId]);

  useEffect(
    () => () => {
      manualSessionRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (query.error?.userMessage) setError(query.error.userMessage);
  }, [query.error]);

  async function saveQuestion() {
    if (!clientId || !questionDraftText.trim()) return;
    try {
      if (questionDraftId)
        await commands.updateQuestion({
          clientId,
          questionId: questionDraftId,
          text: questionDraftText,
        });
      else
        await commands.createQuestion({
          clientId,
          text: questionDraftText,
          enabled: true,
        });
      setQuestionDraftText("");
      setQuestionDraftId(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : "保存问题失败");
    }
  }

  async function toggleQuestion(question: ContentQuestion) {
    try {
      await commands.updateQuestion({
        clientId,
        questionId: question.id,
        enabled: !question.enabled,
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "更新问题状态失败");
    }
  }

  async function deleteQuestion(question: ContentQuestion) {
    if (
      !(await confirm({
        title: "删除采集问题",
        message: `将删除“${question.text}”及其当前回答，但不会修改已保存文章。`,
        confirmLabel: "删除问题",
        tone: "danger",
      }))
    )
      return;
    try {
      await commands.deleteQuestion({ clientId, questionId: question.id });
    } catch (value) {
      setError(value instanceof Error ? value.message : "删除问题失败");
    }
  }

  async function collect(question: ContentQuestion, force: boolean) {
    if (activeQueueStatus(queue.status)) return;
    try {
      if (
        force &&
        !(await confirm({
          title: "重新采集回答",
          message: `将重新采集“${question.text}”，新回答成功后会覆盖当前回答，已保存文章不会被修改。`,
          confirmLabel: "重新采集",
          tone: "warning",
        }))
      )
        return;
      await commands.collectDoubaoQuestion({
        clientId,
        questionId: question.id,
        force,
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "豆包采集失败");
    }
  }

  async function recollect(question: ContentQuestion) {
    if (activeQueueStatus(queue.status)) return;
    try {
      if (
        !(await confirm({
          title: "重新采集回答",
          message: `将重新采集“${question.text}”，新回答成功后会覆盖当前回答，已保存文章不会被修改。`,
          confirmLabel: "重新采集",
          tone: "warning",
        }))
      )
        return;
      await commands.collectDoubaoQuestion({
        clientId,
        questionId: question.id,
        force: true,
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "豆包重新采集失败");
    }
  }

  async function retryFailed() {
    if (activeQueueStatus(queue.status)) return;
    try {
      await commands.retryFailedDoubao();
    } catch (value) {
      setError(value instanceof Error ? value.message : "重试失败任务失败");
    }
  }

  async function pauseCollection() {
    try {
      await commands.pauseDoubaoBatch();
    } catch (value) {
      setError(value instanceof Error ? value.message : "暂停采集失败");
    }
  }

  async function resumeCollection() {
    try {
      await commands.resumeDoubaoBatch();
    } catch (value) {
      setError(value instanceof Error ? value.message : "恢复采集失败");
    }
  }

  async function stopCollection() {
    try {
      await commands.stopDoubaoBatch();
    } catch (value) {
      setError(value instanceof Error ? value.message : "停止采集失败");
    }
  }

  function openQuestionEditor(question: ContentQuestion) {
    setQuestionDraftId(question.id);
    setQuestionDraftText(question.text);
  }

  async function closeManualAnswerSession(force = false) {
    if (!manualAnswerSession) return true;
    if (
      !force &&
      manualAnswerDraftDirty(manualBaseDraftRef.current, manualDraft) &&
      !(await confirm({
        title: "放弃人工回答修改",
        message: "人工回答有未保存修改，关闭后这些修改将丢失。",
        confirmLabel: "放弃修改",
        tone: "warning",
      }))
    )
      return false;
    manualSessionRef.current = null;
    setManualAnswerSession(null);
    setManualDraft({
      answerText: "",
      referenceTitle: "",
      referenceUrl: "",
    });
    manualBaseDraftRef.current = {
      answerText: "",
      referenceTitle: "",
      referenceUrl: "",
    };
    const source = manualSourceRef.current;
    manualSourceRef.current = null;
    source?.focus();
    requestAnimationFrame(() => source?.focus());
    return true;
  }

  async function openManualAnswer(
    question: ContentQuestion,
    researchItem: ContentResearch | undefined,
    source: HTMLButtonElement,
  ) {
    if (manualAnswerSession && !(await closeManualAnswerSession())) return;
    const nextDraft: ManualAnswerDraft = {
      answerText: researchItem?.answerText || "",
      referenceTitle: researchItem?.references?.[0]?.title || "",
      referenceUrl: researchItem?.references?.[0]?.url || "",
    };
    const nextSession = createManualAnswerSession(
      clientId,
      question.id,
      `manual:${++sessionTokenSequence.current}`,
    );
    manualSourceRef.current = source;
    manualBaseDraftRef.current = nextDraft;
    manualSessionRef.current = nextSession;
    setManualDraft(nextDraft);
    setManualAnswerSession(nextSession);
    setError("");
  }

  async function saveManual() {
    const session = manualAnswerSession;
    if (
      !session ||
      session.clientId !== clientId ||
      !manualDraft.answerText.trim()
    )
      return;
    const references =
      manualDraft.referenceTitle.trim() && manualDraft.referenceUrl.trim()
        ? [
            {
              title: manualDraft.referenceTitle.trim(),
              url: manualDraft.referenceUrl.trim(),
            },
          ]
        : [];
    try {
      await commands.saveManualResearch({
        clientId: session.clientId,
        questionId: session.questionId,
        answerText: manualDraft.answerText,
        references,
      });
      if (!sameManualAnswerSession(manualSessionRef.current, session)) return;
      if (!sameManualAnswerSession(manualSessionRef.current, session)) return;
      await closeManualAnswerSession(true);
    } catch (value) {
      if (sameManualAnswerSession(manualSessionRef.current, session))
        setError(
          value instanceof Error ? value.message : "保存人工回答失败",
        );
    }
  }

  async function refreshLogin() {
    try {
      await commands.getDoubaoLoginStatus();
    } catch (value) {
      if (
        value instanceof Error &&
        "code" in value &&
        value.code === "PLAYWRIGHT_SESSION_NOT_OPEN"
      ) {
        setError("");
        return;
      }
      setError(value instanceof Error ? value.message : "无法读取登录状态");
    }
  }

  async function loginNow() {
    try {
      await commands.openDoubaoLogin();
    } catch (value) {
      setError(value instanceof Error ? value.message : "无法打开豆包登录");
    }
  }

  const manualQuestion = manualAnswerSession
    ? questions.find((item) => item.id === manualAnswerSession.questionId)
    : null;
  const manualClient = clients.find((item) => item.id === clientId);

  return (
    <div className="content-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div>
          <p className="text-xs font-bold text-slate-700">问题采集</p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            当前启用 {selectedQuestionCount} 个问题
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={loginTone(login.status)}>
            豆包：{loginQuery.loading ? "检查中" : login.status}
          </StatusBadge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refreshLogin()}
            disabled={loginQuery.loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={() => void loginNow()}
            disabled={loginQuery.loading}
          >
            <LogIn className="h-3.5 w-3.5" />
            打开登录
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          <QuestionBatchControls
            grouping={grouping}
            clients={clients}
            initialClientId={clientId}
            isCollecting={isCollecting}
            commands={{
              previewDoubaoBatch: commands.previewDoubaoBatch,
              startPreparedDoubaoBatch: commands.startPreparedDoubaoBatch,
            }}
            onError={setError}
          />

          <Surface className="p-3.5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold text-slate-800">问题与采集</h2>
                {questionDraftId && (
                  <p className="mt-1 max-w-xl truncate text-[11px] text-blue-700">
                    正在编辑：
                    {questions.find((item) => item.id === questionDraftId)
                      ?.text || "问题"}
                  </p>
                )}
              </div>
              <span className="text-[10px] font-medium text-slate-400">
                当前客户 · 启用 {selectedQuestionCount}
              </span>
            </div>

            <div className="mb-3 flex min-w-0 gap-2">
              <input
                aria-label="问题草稿"
                value={questionDraftText}
                onChange={(event) => setQuestionDraftText(event.target.value)}
                placeholder="新增或编辑问题"
                className="ui-field h-9 min-w-0 flex-1"
              />
              <Button
                size="sm"
                onClick={() => void saveQuestion()}
                title="保存问题"
                aria-label="保存问题"
              >
                <Save className="h-3.5 w-3.5" />
                保存
              </Button>
              {questionDraftId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setQuestionDraftText("");
                    setQuestionDraftId(null);
                  }}
                >
                  取消编辑
                </Button>
              )}
            </div>

            <QuestionResearchList
              questions={questions}
              research={research}
              manualAnswerSession={manualAnswerSession}
              manualSourceRef={manualSourceRef}
              isCollecting={isCollecting}
              onToggle={(question) => void toggleQuestion(question)}
              onEdit={openQuestionEditor}
              onManualAnswer={(question, item, source) => {
                void openManualAnswer(question, item, source);
              }}
              onCollect={(question) => void collect(question, false)}
              onRecollect={(question) => void recollect(question)}
              onDelete={(question) => void deleteQuestion(question)}
            />
          </Surface>

          {(error ||
            queueQuery.error?.userMessage ||
            loginQuery.error?.userMessage) && (
            <div
              role="alert"
              className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"
            >
              {error ||
                queueQuery.error?.userMessage ||
                loginQuery.error?.userMessage}
            </div>
          )}
        </div>

        {manualAnswerSession && manualQuestion && (
          <ManualResearchEditorPanel
            session={manualAnswerSession}
            draft={manualDraft}
            questionText={manualQuestion.text}
            clientName={manualClient?.name || clientId}
            saving={manualSaving}
            onDraftChange={setManualDraft}
            onSave={() => void saveManual()}
            onClose={() => {
              void closeManualAnswerSession();
            }}
          />
        )}
      </div>

      <CollectionTaskBar
        queue={queue}
        busy={collectionPending}
        onPause={() => void pauseCollection()}
        onResume={() => void resumeCollection()}
        onStop={() => void stopCollection()}
        onRetry={retryFailed}
      />
    </div>
  );
}
