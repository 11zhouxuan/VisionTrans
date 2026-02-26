export interface WordEntry {
  id: string;
  word: string;
  translation: string;
  wordType: 'word' | 'phrase' | 'passage';
  starred: boolean;
  queryCount: number;
  pageNumber: number | null;
  sourceTitle: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  imageBase64?: string | null; // Optional screenshot Base64
  /** @deprecated Legacy field for backward compatibility */
  isSingleWord?: boolean;
}