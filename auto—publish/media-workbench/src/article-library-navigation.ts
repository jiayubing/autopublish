export type ArticleLibraryNavigationDestination =
  | "article"
  | "publication"
  | "submission";

export interface ArticleLibraryNavigationIntent {
  articleId?: string;
  generationBatchId?: string;
  clientId?: string;
  destination?: ArticleLibraryNavigationDestination;
}
