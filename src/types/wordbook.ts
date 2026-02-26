export interface WordEntry {
  id: string;
  word: string;
  translation: string;
  isSingleWord: boolean;
  starred: boolean;
  queryCount: number;
  pageNumber: number | null;
  sourceTitle: string | null;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  imageBase64?: string | null;  // Optional screenshot Base64
}
