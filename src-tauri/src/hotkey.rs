use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

use crate::errors::AppError;
use crate::services::screenshot;
use crate::state::AppState;

/// Setup global hotkey on app startup
pub fn setup_hotkey(app: &AppHandle) -> Result<(), AppError> {
    let hotkey_str = get_configured_hotkey(app);
    register_hotkey(app, &hotkey_str)
}

/// Register a global hotkey
pub fn register_hotkey(app: &AppHandle, hotkey_str: &str) -> Result<(), AppError> {
    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(hotkey_str, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = trigger_capture(&app_handle);
            }
        })
        .map_err(|e| AppError::Internal(format!("Failed to register hotkey '{}': {}", hotkey_str, e)))?;
    Ok(())
}

/// Update global hotkey (unregister old, register new)
#[tauri::command]
pub async fn update_hotkey(app: AppHandle, hotkey: String) -> Result<bool, AppError> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| AppError::Internal(format!("Failed to unregister hotkeys: {}", e)))?;
    register_hotkey(&app, &hotkey)?;
    Ok(true)
}

fn get_configured_hotkey(app: &AppHandle) -> String {
    if let Ok(store) = app.store("config.json") {
        if let Some(value) = store.get("hotkey") {
            if let Some(hotkey) = value.as_str() {
                return hotkey.to_string();
            }
        }
    }
    "Alt+Q".to_string()
}

pub fn trigger_capture(app: &AppHandle) -> Result<(), AppError> {
    let t0 = std::time::Instant::now();
    let state = app.state::<AppState>();

    // Prevent duplicate triggers
    {
        let mut is_capturing = state.is_capturing.lock().unwrap();
        if *is_capturing {
            return Ok(());
        }
        *is_capturing = true;
    }

    // Check if paused
    {
        let is_paused = state.is_paused.lock().unwrap();
        if *is_paused {
            *state.is_capturing.lock().unwrap() = false;
            return Ok(());
        }
    }

    // Check concurrency limit
    {
        let max_concurrency = app.store("config.json")
            .ok()
            .and_then(|s| s.get("maxConcurrency"))
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(1)
            .max(1);

        let active_count = state.active_count();
        if active_count >= max_concurrency {
            *state.is_capturing.lock().unwrap() = false;
            let _ = app.notification()
                .builder()
                .title("VisionTrans")
                .body(format!("当前已有 {} 个翻译任务进行中，请等待完成后再试", active_count))
                .show();
            #[cfg(target_os = "macos")]
            {
                let msg = format!("当前已有 {} 个翻译任务进行中，请等待完成后再试", active_count);
                let _ = std::process::Command::new("osascript")
                    .args(["-e", &format!("display notification \"{}\" with title \"VisionTrans\"", msg)])
                    .spawn();
            }
            return Ok(());
        }
    }

    #[cfg(target_os = "macos")]
    {
        if !crate::services::permission::check_screen_recording_permission() {
            *state.is_capturing.lock().unwrap() = false;
            crate::services::permission::request_screen_recording_permission();
            return Err(AppError::ScreenRecordingPermissionDenied);
        }
    }

    // Capture screenshot (writes BMP to temp file + JPEG base64 fallback)
    let screenshot_data = match screenshot::capture_current_screen() {
        Ok(data) => data,
        Err(e) => {
            *state.is_capturing.lock().unwrap() = false;
            return Err(e);
        }
    };

    let t_capture = t0.elapsed();

    // Store screenshot data
    *state.last_screenshot.lock().unwrap() = Some(screenshot_data.clone());

    // Show overlay window immediately (reuse if exists, create if not)
    show_overlay_window(app, &screenshot_data)?;

    let t_total = t0.elapsed();
    eprintln!("[perf] Total trigger_capture: {:?} (capture: {:?}, window: {:?})",
        t_total, t_capture, t_total - t_capture);

    Ok(())
}

// NOTE: NSWindow properties (level, collectionBehavior) are now set in
// commands::window::show_overlay_window, which is called by the frontend
// after the canvas is ready. This ensures properties are set right before
// the window becomes visible, preventing Space switches.

fn show_overlay_window(
    app: &AppHandle,
    screenshot: &crate::state::ScreenshotData,
) -> Result<(), AppError> {
    let overlay_w = screenshot.logical_width as f64;
    let overlay_h = screenshot.logical_height as f64;

    // Try to reuse existing overlay window (pre-created or from previous capture)
    if let Some(existing) = app.get_webview_window("overlay") {
        eprintln!("[overlay] Reusing existing overlay window");

        // Resize to match current screen
        let _ = existing.set_size(tauri::LogicalSize::new(overlay_w, overlay_h));
        let _ = existing.set_position(tauri::LogicalPosition::new(0.0, 0.0));

        // Emit event to tell frontend to reload screenshot data
        // Frontend will call show_overlay_window AFTER image is loaded (no flash)
        let _ = app.emit("screenshot-ready", ());

        return Ok(());
    }

    // Create new overlay window (first time or if pre-creation failed)
    // The window is created hidden (visible=false). The frontend will:
    // 1. Detect it's the overlay window via getCurrentWindow().label
    // 2. Fetch screenshot data via get_screenshot command
    // 3. Load the image and draw it onto the canvas
    // 4. Call show_overlay_window command to make it visible
    // This ensures the window is never shown with stale/empty content.
    eprintln!("[overlay] Creating new overlay window (hidden, will show after canvas ready)");
    use tauri::WebviewWindowBuilder;

    let _window = WebviewWindowBuilder::new(app, "overlay", tauri::WebviewUrl::App("/".into()))
        .title("")
        .inner_size(overlay_w, overlay_h)
        .position(0.0, 0.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(|e: tauri::Error| AppError::WindowError(e.to_string()))?;

    // Do NOT show the window here. The frontend will call show_overlay_window
    // after the screenshot is loaded and drawn onto the canvas.
    // This prevents any flash of empty/stale content.

    Ok(())
}
