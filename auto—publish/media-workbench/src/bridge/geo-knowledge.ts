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
    Reply<{ knowledge: GeoKnowledge | null; state: KnowledgeState }>
  >;
  state: (input: ClientInput) => Promise<Reply<{ state: KnowledgeState }>>;
  generate: (input: ClientInput) => Promise<Reply<{ knowledge: GeoKnowledge }>>;
  cancel: (input: ClientInput) => Promise<Reply<{ state: KnowledgeState }>>;
  edit: (input: KnowledgeEdit) => Promise<Reply<{ knowledge: GeoKnowledge }>>;
  exportMarkdown: (input: ClientInput) => Promise<Reply<{ markdown: string }>>;
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
export const generateKnowledge = (clientId: string) =>
  call((api) => requireBridgeMethod(api.generate)({ clientId }));
export const cancelKnowledge = (clientId: string) =>
  call((api) => requireBridgeMethod(api.cancel)({ clientId }));
export const editKnowledge = (input: KnowledgeEdit) =>
  call((api) => requireBridgeMethod(api.edit)(input));
export const exportKnowledge = (clientId: string) =>
  call((api) => requireBridgeMethod(api.exportMarkdown)({ clientId }));
export const getGeoConfig = () =>
  call((api) => requireBridgeMethod(api.configStatus)());
export const saveGeoConfig = (input: GeoConfigInput) =>
  call((api) => requireBridgeMethod(api.saveConfig)(input));
export const testGeoConnection = (input: { search: boolean }) =>
  call((api) => requireBridgeMethod(api.testConnection)(input));
