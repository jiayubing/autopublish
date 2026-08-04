import type {
  PlatformArticle,
  PlatformSubmitResult,
  PlatformTarget,
} from "../types/platform";

// Keep display ordering and identity rules together so the view components
// never recreate platform or article identity locally.
export const PLATFORM_ORDER = ["lieju", "toutiao", "hepan"] as const;

export function articleSelectionKey(article: PlatformArticle): string {
  return `${article.sourcePlatformId}\u0000${article.filename}`;
}

export function archiveErrorText(value: string | null | undefined): string {
  return value || "ARCHIVE_FAILED";
}

export type PlatformSubmissionResult = PlatformSubmitResult & {
  archiveSummary?: {
    attempted?: number;
    succeeded?: number;
    failed?: number;
  };
  trashDisposition?: string;
  trashSummary?: {
    offeredCount?: number;
    recoveryCount?: number;
    reasonCodes?: string[];
  };
};

export type PlatformLoginState = {
  busy?: boolean;
  message?: string;
  authenticated?: boolean;
};

export type PlatformLoginStates = Record<
  string,
  PlatformLoginState | undefined
>;

export type PlatformSelectionProps = {
  queue: PlatformArticle[];
  platforms: PlatformTarget[];
  loading: boolean;
  selectedArticles: ReadonlySet<string>;
  collapsedGroups: ReadonlySet<string>;
  isSelectableArticle: (article: PlatformArticle) => boolean;
  onReplaceArticles: (keys: string[]) => void;
  onToggleArticle: (key: string) => void;
  onToggleGroupCollapse: (platformId: string) => void;
};
