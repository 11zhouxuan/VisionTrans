export interface TranslateResult {
  translation: string;
  sourceLanguage: string;
  targetLanguage: string;
  imageBase64?: string;
}

export interface TranslateError {
  code: string;
  message: string;
  action?: 'settings' | 'retry';
}

// ===== Streaming event types =====
export type StreamEvent =
  | { type: 'thinking' }
  | { type: 'rendering'; translationType: string; sourceLanguage: string; targetLanguage: string }
  | { type: 'field-start'; field: string; attrs?: Record<string, string> }
  | { type: 'field-delta'; field: string; text: string }
  | { type: 'field-end'; field: string }
  | { type: 'item-start' }
  | { type: 'item-end' }
  | { type: 'complete'; fullXml: string }
  | { type: 'error'; message: string };

export interface ScreenshotData {
  base64: string;
  filePath: string;
  logicalWidth: number;
  logicalHeight: number;
  scaleFactor: number;
}

export interface Position {
  x: number;
  y: number;
}
