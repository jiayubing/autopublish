import {
  ipcError,
  requireBridgeCapability,
  requireBridgeMethod,
  requireDesktopConsole,
} from "./transport";
import type { IpcError } from "../types/ipc";
import type {
  GeoKnowledge,
  KnowledgeState,
  KnowledgeEdit,
  GeoConfigStatus,
  GeoConfigInput,
  GeoConnectionResult,
  KnowledgeQuestionDetails,
  KnowledgeQuestionArticles,
  KnowledgeStorageStatus,
  GeoPromptSettings,
  CustomerConfirmationModel,
} from "../types/geo-knowledge";
type Reply<T> = { ok: true; data: T } | { ok: false; error: IpcError };
type ClientInput = { clientId: string };
type Api = {
  questionArticles: (input: {
    clientId: string;
    id: string;
  }) => Promise<Reply<KnowledgeQuestionArticles>>;
  linkQuestions: (input: {
    clientId: string;
    revision: number;
    ids: string[];
  }) => Promise<Reply<{ knowledge: GeoKnowledge }>>;
  questionDetails: (input: {
    clientId: string;
    id: string;
  }) => Promise<Reply<KnowledgeQuestionDetails>>;
  load: (
    input: ClientInput,
  ) => Promise<
    Reply<{ knowledge: GeoKnowledge | null; storageStatus: KnowledgeStorageStatus; state: KnowledgeState }>
  >;
  state: (input: ClientInput) => Promise<Reply<{ state: KnowledgeState }>>;
  generate: (input: ClientInput & { temporaryPrompt?: string }) => Promise<Reply<{ knowledge: GeoKnowledge }>>;
  cancel: (input: ClientInput) => Promise<Reply<{ state: KnowledgeState }>>;
  edit: (input: KnowledgeEdit) => Promise<Reply<{ knowledge: GeoKnowledge }>>;
  confirmSourceType: (input: { clientId: string; revision: number; sourceId: string; targetType: "official_web" | "client_public" }) => Promise<Reply<{ knowledge: GeoKnowledge }>>;
  resolveConflict: (input: { clientId: string; revision: number; conflictId: string; claimId?: string; value?: string }) => Promise<Reply<{ knowledge: GeoKnowledge }>>;
  promptSettings: (input: ClientInput) => Promise<Reply<GeoPromptSettings>>;
  saveGlobalPrompt: (input: { researchPromptOverride: string }) => Promise<Reply<{ defaultGlobalPrompt: string; globalPrompt: string }>>;
  saveClientPrompt: (input: { clientId: string; researchPrompt: string }) => Promise<Reply<{ researchPrompt: string }>>;
  previewConfirmation: (input: ClientInput & { revision: number }) => Promise<Reply<{ model: CustomerConfirmationModel }>>;
  exportMarkdown: (input: ClientInput & { revision: number }) => Promise<Reply<{ markdown: string }>>;
  configStatus: () => Promise<Reply<GeoConfigStatus>>;
  saveConfig: (input: GeoConfigInput) => Promise<Reply<GeoConfigStatus>>;
  testConnection: (input: {
    search: boolean;
  }) => Promise<Reply<GeoConnectionResult>>;
};
async function call<T>(invoke: (api: Api) => Promise<Reply<T>>): Promise<T> {
  const api = requireBridgeCapability<Api>(
    requireDesktopConsole().geoKnowledge,
  );
  const reply = await invoke(api);
  if (reply.ok === false) throw ipcError(reply.error, "知识库操作未完成。");
  if (reply.data === undefined) throw ipcError(undefined, "知识库结果无效。");
  return reply.data;
}
export const loadKnowledge = (clientId: string) =>
  call((api) => requireBridgeMethod(api.load)({ clientId }));
export const getKnowledgeQuestionArticles = (clientId: string, id: string) =>
  call((api) => requireBridgeMethod(api.questionArticles)({ clientId, id }));
export const linkKnowledgeQuestions = (
  clientId: string,
  revision: number,
  ids: string[],
) =>
  call((api) =>
    requireBridgeMethod(api.linkQuestions)({ clientId, revision, ids }),
  );
export const getKnowledgeQuestionDetails = (clientId: string, id: string) =>
  call((api) => requireBridgeMethod(api.questionDetails)({ clientId, id }));
export const knowledgeState = (clientId: string) =>
  call((api) => requireBridgeMethod(api.state)({ clientId }));
export const generateKnowledge = (clientId: string, temporaryPrompt = "") =>
  call((api) => requireBridgeMethod(api.generate)({ clientId, temporaryPrompt }));
export const cancelKnowledge = (clientId: string) =>
  call((api) => requireBridgeMethod(api.cancel)({ clientId }));
export const editKnowledge = (input: KnowledgeEdit) =>
  call((api) => requireBridgeMethod(api.edit)(input));
export const confirmKnowledgeSourceType = (input: { clientId: string; revision: number; sourceId: string; targetType: "official_web" | "client_public" }) =>
  call((api) => requireBridgeMethod(api.confirmSourceType)(input));
export const resolveKnowledgeConflict = (input: { clientId: string; revision: number; conflictId: string; claimId?: string; value?: string }) =>
  call((api) => requireBridgeMethod(api.resolveConflict)(input));
export const getGeoPromptSettings = (clientId: string) =>
  call((api) => requireBridgeMethod(api.promptSettings)({ clientId }));
export const saveGeoGlobalPrompt = (researchPromptOverride: string) =>
  call((api) => requireBridgeMethod(api.saveGlobalPrompt)({ researchPromptOverride }));
export const saveGeoClientPrompt = (clientId: string, researchPrompt: string) =>
  call((api) => requireBridgeMethod(api.saveClientPrompt)({ clientId, researchPrompt }));
export const previewCustomerConfirmation = (clientId: string, revision: number) =>
  call((api) => requireBridgeMethod(api.previewConfirmation)({ clientId, revision }));
export const exportKnowledge = (clientId: string, revision: number) =>
  call((api) => requireBridgeMethod(api.exportMarkdown)({ clientId, revision }));
export const getGeoConfig = () =>
  call((api) => requireBridgeMethod(api.configStatus)());
export const saveGeoConfig = (input: GeoConfigInput) =>
  call((api) => requireBridgeMethod(api.saveConfig)(input));
export const testGeoConnection = (input: { search: boolean }) =>
  call((api) => requireBridgeMethod(api.testConnection)(input));
