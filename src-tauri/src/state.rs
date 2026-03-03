use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
    /// Set of active result window IDs (for concurrency tracking)
    pub active_result_windows: Mutex<HashSet<String>>,
    /// Counter for generating unique result window IDs
    pub result_window_counter: Mutex<u32>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            is_capturing: Mutex::new(false),
            is_paused: Mutex::new(false),
            last_screenshot: Mutex::new(None),
            last_translation_request: Mutex::new(None),
            active_result_windows: Mutex::new(HashSet::new()),
            result_window_counter: Mutex::new(0),
        }
    }

    /// Get the number of active translation windows
    pub fn active_count(&self) -> usize {
        self.active_result_windows.lock().unwrap().len()
    }

    /// Allocate a new result window ID, returns None if at capacity
    pub fn allocate_result_window(&self, max_concurrency: usize) -> Option<String> {
        let mut windows = self.active_result_windows.lock().unwrap();
        if windows.len() >= max_concurrency {
            return None;
        }
        let mut counter = self.result_window_counter.lock().unwrap();
        let id = format!("result-{}", *counter);
        *counter += 1;
        windows.insert(id.clone());
        Some(id)
    }

    /// Release a result window ID when the window is closed
    pub fn release_result_window(&self, id: &str) {
        self.active_result_windows.lock().unwrap().remove(id);
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ScreenshotData {
    /// Base64 encoded JPEG image
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