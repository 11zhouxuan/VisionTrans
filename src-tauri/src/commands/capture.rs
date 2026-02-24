use tauri::{AppHandle, State};

use crate::errors::AppError;
use crate::state::{AppState, ScreenshotData};

/// Get the latest screenshot data
#[tauri::command]
pub async fn get_screenshot(state: State<'_, AppState>) -> Result<ScreenshotData, AppError> {
    state
        .last_screenshot
        .lock()
        .unwrap()
        .clone()
        .ok_or(AppError::Internal("无截图数据".into()))
}

/// Trigger capture from frontend (e.g., settings page button)
#[tauri::command]
pub async fn trigger_capture_command(app: AppHandle) -> Result<(), AppError> {
    crate::hotkey::trigger_capture(&app)
}
