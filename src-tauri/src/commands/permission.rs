use serde::Serialize;

use crate::errors::AppError;
use crate::services::permission;

#[derive(Serialize)]
pub struct PermissionStatus {
    #[serde(rename = "screenRecording")]
    pub screen_recording: bool,
}

/// Check system permissions
#[tauri::command]
pub async fn check_permission() -> Result<PermissionStatus, AppError> {
    Ok(PermissionStatus {
        screen_recording: permission::check_screen_recording_permission(),
    })
}

/// Request system permissions
#[tauri::command]
pub async fn request_permission() -> Result<bool, AppError> {
    Ok(permission::request_screen_recording_permission())
}
