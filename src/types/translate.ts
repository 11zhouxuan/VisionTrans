export interface TranslateResult {
  translation: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslateError {
  code: string;
  message: string;
  action?: 'settings' | 'retry';
}

export interface ScreenshotData {
  base64: string;
  logicalWidth: number;
  logicalHeight: number;
  scaleFactor: number;
}

export interface Position {
  x: number;
  y: number;
}
