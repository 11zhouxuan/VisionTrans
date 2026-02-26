import { invoke } from '@tauri-apps/api/core';
import type { ScreenshotData, Position } from '../types/translate';
import type { WordEntry } from '../types/wordbook';

/**
 * Get the latest screenshot data from Rust backend
 */
export async function getScreenshot(): Promise<ScreenshotData> {
  return invoke<ScreenshotData>('get_screenshot');
}

/**
 * Start translation with cropped image
 */
export async function startTranslation(imageBase64: string, position: Position): Promise<void> {
  return invoke('start_translation', { imageBase64, position });
}

/**
 * Test API connection (reads config from store)
 */
export async function testApiConnection(): Promise<boolean> {
  return invoke<boolean>('test_api_connection');
}

/**
 * Check system permissions (macOS screen recording)
 */
export async function checkPermission(): Promise<{ screenRecording: boolean }> {
  return invoke<{ screenRecording: boolean }>('check_permission');
}

/**
 * Request system permissions (macOS screen recording)
 */
export async function requestPermission(): Promise<boolean> {
  return invoke<boolean>('request_permission');
}

/**
 * Open settings window
 */
export async function openSettingsWindow(): Promise<void> {
  return invoke('open_settings_window');
}

/**
 * Close overlay window and reset capture state
 */
export async function closeOverlay(): Promise<void> {
  return invoke('close_overlay');
}

/**
 * Update global hotkey
 */
export async function updateHotkey(hotkey: string): Promise<boolean> {
  return invoke<boolean>('update_hotkey', { hotkey });
}

// ==================== Wordbook API ====================

/**
 * Save a word to the wordbook
 */
export async function saveWordToWordbook(
  word: string,
  translation: string,
  wordType: 'word' | 'phrase' | 'passage',
  sourceLanguage: string,
  targetLanguage: string,
  imageBase64?: string,
): Promise<WordEntry> {
  return invoke<WordEntry>('save_word_to_wordbook', {
    word,
    translation,
    wordType,
    sourceLanguage,
    targetLanguage,
    imageBase64: imageBase64 || null,
  });
}

/**
 * Get all words from the wordbook
 */
export async function getAllWords(): Promise<WordEntry[]> {
  return invoke<WordEntry[]>('get_all_words');
}

/**
 * Toggle star status of a word
 */
export async function toggleStarWord(id: string): Promise<WordEntry> {
  return invoke<WordEntry>('toggle_star_word', { id });
}

/**
 * Delete a word from the wordbook
 */
export async function deleteWordFromWordbook(id: string): Promise<void> {
  return invoke('delete_word_from_wordbook', { id });
}

/**
 * Open the wordbook window
 */
export async function openWordbookWindow(): Promise<void> {
  return invoke('open_wordbook_window');
}
