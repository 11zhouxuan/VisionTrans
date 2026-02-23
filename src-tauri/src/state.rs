use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// Application runtime global state, injected via Tauri's State mechanism
pub struct AppState {
    /// Whether currently in screenshot/painting state
    pub is_capturing: Mutex<bool>,
    /// Whether hotkey listening is paused
    pub is_paused: Mutex<bool>,
    /// Latest screenshot Base64 data (for passing to overlay window)
    pub last_screenshot: Mutex<Option<ScreenshotData>>,
    /// Last translation request data (for retry)
    pub last_translation_request: Mutex<Option<TranslationRequest>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            is_capturing: Mutex::new(false),
            is_paused: Mutex::new(false),
            last_screenshot: Mutex::new(None),
            last_translation_request: Mutex::new(None),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ScreenshotData {
    /// Base64 encoded PNG image
    pub base64: String,
    /// Logical width (CSS pixels)
    #[serde(rename = "logicalWidth")]
    pub logical_width: u32,
    /// Logical height (CSS pixels)
    #[serde(rename = "logicalHeight")]
    pub logical_height: u32,
    /// Device pixel ratio (DPR)
    #[serde(rename = "scaleFactor")]
    pub scale_factor: f64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TranslationRequest {
    pub image_base64: String,
    pub position: Position,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}
