export type KnowledgeSection =
  | "profile"
  | "offerings"
  | "capabilities"
  | "scenarios"
  | "geoQuestions"
  | "externalResearch"
  | "restrictions";
export type KnowledgeItem = {
  id: string;
  identity: string;
  name?: string;
  description?: string;
  fields?: Record<string, string>;
  basis: "fact" | "research" | "derived" | "candidate";
  origin: "ai" | "manual";
  locked: boolean;
  sourceIds: string[];
  relatedOfferingIds: string[];
  relatedScenarioIds: string[];
  intent?: string;
  knowledgeCoverage?: string;
  type?: string;
  questionId?: string | null;
};
export type KnowledgeSource = {
  id: string;
  type: string;
  title: string;
  url?: string;
  fetchedAt?: string;
  fileName?: string;
  materialId?: string;
  contentHash?: string;
  citationVerified?: boolean;
};
export type GeoKnowledge = {
  schemaVersion: number;
  clientId: string;
  revision: number;
  businessType: string;
  generatedAt: string;
  updatedAt: string;
  status: { outcome: "complete" | "partial"; warnings: string[] };
  profile: KnowledgeItem;
  offerings: KnowledgeItem[];
  capabilities: KnowledgeItem[];
  scenarios: KnowledgeItem[];
  geoQuestions: KnowledgeItem[];
  externalResearch: KnowledgeItem[];
  restrictions: KnowledgeItem[];
  sources: KnowledgeSource[];
};
export type KnowledgeState = {
  phase: string;
  running: boolean;
  completed?: number;
  total?: number;
  errorCode?: string;
};
export type GeoConfigStatus = {
  baseUrl: string;
  configured: boolean;
  model: string;
  webSearch: boolean;
};
export type GeoConfigInput = {
  baseUrl: string;
  model: string;
  apiKey: string;
  webSearch: boolean;
};
export type GeoConnectionResult = { search: boolean; citationCount: number };
export type KnowledgeEdit = {
  clientId: string;
  revision: number;
  section: KnowledgeSection;
  id: string;
  changes: {
    name?: string;
    description?: string;
    fields?: Record<string, string>;
  };
};
export type KnowledgeQuestionDetails = {
  id: string;
  linkStatus: "unlinked" | "linked" | "stale";
  enabled: boolean | null;
  clientMentioned: boolean | null;
  research: null | {
    question: string;
    answerText: string;
    collectedAt: string;
    collectionMethod: string;
    references: { title: string; url: string }[];
  };
};
export type KnowledgeQuestionArticles = {
  articles: { id: string; title: string; stage: string; label: string }[];
  total: number;
  publishedCount: number;
};
