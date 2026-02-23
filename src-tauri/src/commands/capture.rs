use tauri::State;

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
