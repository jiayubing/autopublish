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
  configured: boolean;
  model: string;
  webSearch: boolean;
};
export type GeoConfigInput = {
  model: string;
  apiKey: string;
  webSearch: boolean;
};
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
