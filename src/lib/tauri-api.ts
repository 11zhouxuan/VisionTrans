import { invoke } from '@tauri-apps/api/core';
import type { ScreenshotData, Position } from '../types/translate';

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
